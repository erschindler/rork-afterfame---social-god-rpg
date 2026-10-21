/**
 * Idempotent, resumable world initialization. Each step records progress in
 * worlds.init_step; a retried call resumes without duplicating seed data.
 */
import { check, type Db, log } from "../http.ts";
import { Rng } from "../sim/rng.ts";
import { POPULATION, THEME_TOPICS, type WorldTheme } from "../sim/config.ts";
import { generatePopulation } from "../sim/population.ts";
import { COMMUNITY_DEFS } from "../sim/communities.ts";
import { chooseIntent, generatePost, generateReply, type ReplyStance } from "../sim/text.ts";
import { vocabFor } from "../sim/vocab.ts";
import { abstractEngagement, insertBatched, isoMinutesAgo, voiceOf } from "./util.ts";
import { SIM_COLUMNS, type SimRow, type WorldRow } from "./types.ts";
import { createEvent, recordEffect } from "./store.ts";

const STEPS = ["accounts", "communities", "graph", "content", "done"] as const;

export async function initializeWorld(db: Db, world: WorldRow): Promise<void> {
  let step = world.init_step ?? "accounts";
  const started = Date.now();
  try {
    while (step !== "done") {
      if (step === "accounts") await stepAccounts(db, world);
      else if (step === "communities") await stepCommunities(db, world);
      else if (step === "graph") await stepGraph(db, world);
      else if (step === "content") await stepContent(db, world);
      const idx = STEPS.indexOf(step as (typeof STEPS)[number]);
      step = STEPS[idx + 1];
      check(await db.from("worlds").update({ init_step: step, updated_at: new Date().toISOString() }).eq("id", world.id), "init_step");
    }
    log("info", "world_initialized", { world: world.id, ms: Date.now() - started });
  } catch (err) {
    log("error", "world_init_failed", { world: world.id, step, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

async function stepAccounts(db: Db, world: WorldRow): Promise<void> {
  const target = POPULATION[world.world_size];
  const accounts = generatePopulation(Number(world.seed), world.world_theme as WorldTheme, target);
  const now = Date.now();
  const rows = accounts.map((a) => ({
    world_id: world.id, seq: a.seq, username: a.username, display_name: a.display_name, bio: a.bio, avatar_reference: a.avatar_reference,
    archetype: a.archetype, personality_traits: a.personality_traits, interests: a.interests, expertise: a.expertise,
    communication_style: a.communication_style, humor_style: a.humor_style, current_goals: a.current_goals, fame: a.fame,
    admiration: a.admiration, infamy: a.infamy, credibility: a.credibility, influence: a.influence, controversy: a.controversy,
    audience_loyalty: a.audience_loyalty, follower_count_cache: a.follower_count_cache, following_count_cache: a.following_count_cache,
    activity_profile: a.activity_profile, account_created_at: new Date(now - a.account_age_days * 86_400_000).toISOString(),
  }));
  // Upsert on (world_id, seq) so a retry never duplicates accounts.
  for (let i = 0; i < rows.length; i += 500) {
    check(await db.from("simulated_accounts").upsert(rows.slice(i, i + 500), { onConflict: "world_id,seq", ignoreDuplicates: true }), "seed_accounts");
  }
}

async function stepCommunities(db: Db, world: WorldRow): Promise<void> {
  const topics = THEME_TOPICS[world.world_theme as WorldTheme];
  const rows = topics.map((t) => COMMUNITY_DEFS[t]).filter(Boolean).map((c) => ({
    world_id: world.id, name: c.name, slug: c.slug, description: c.description, topic_id: c.topic, community_norms: c.norms,
  }));
  check(await db.from("communities").upsert(rows, { onConflict: "world_id,slug", ignoreDuplicates: true }), "seed_communities");
}

export async function loadAllSims(db: Db, worldId: string): Promise<SimRow[]> {
  const out: SimRow[] = [];
  for (let from = 0; ; from += 1000) {
    const page = check(await db.from("simulated_accounts").select(SIM_COLUMNS).eq("world_id", worldId).order("seq").range(from, from + 999), "load_sims") as SimRow[];
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

async function stepGraph(db: Db, world: WorldRow): Promise<void> {
  // Clean any partial graph from a failed previous attempt (world is not yet playable).
  check(await db.from("follows").delete().eq("world_id", world.id).eq("follower_type", "sim").eq("followed_type", "sim"), "clean_graph");
  check(await db.from("community_memberships").delete().eq("world_id", world.id).eq("member_type", "sim"), "clean_memberships");

  const sims = await loadAllSims(db, world.id);
  const rng = new Rng(`${world.seed}:graph`);
  const follows: Record<string, unknown>[] = [];
  for (const s of sims) {
    const r = rng.fork(s.seq);
    const n = r.int(4, 9);
    const chosen = new Set<string>();
    for (let k = 0; k < n * 3 && chosen.size < n; k++) {
      const t = r.weighted(sims, (o) => (o.id === s.id ? 0 : 1 + o.fame / 8 + (o.interests.some((i) => s.interests.includes(i)) ? 4 : 0)));
      if (t.id !== s.id) chosen.add(t.id);
    }
    for (const id of chosen) follows.push({ world_id: world.id, follower_type: "sim", follower_simulated_account_id: s.id, followed_type: "sim", followed_simulated_account_id: id, reason: "seed" });
  }
  await insertBatched(db, "follows", follows, 1000);

  const communities = check(await db.from("communities").select("id, topic_id").eq("world_id", world.id), "load_communities") as { id: string; topic_id: string }[];
  const memberships: Record<string, unknown>[] = [];
  const counts = new Map<string, number>();
  for (const s of sims) {
    const r = rng.fork(`cm${s.seq}`);
    for (const c of communities) {
      if (s.interests.includes(c.topic_id) && r.chance(0.55)) {
        const role = (s.archetype === "moderator" || s.archetype === "community_leader") && r.chance(0.5) ? "moderator" : "member";
        memberships.push({ world_id: world.id, community_id: c.id, member_type: "sim", simulated_account_id: s.id, role, standing: role === "moderator" ? 30 : r.int(0, 15) });
        counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
      }
    }
  }
  await insertBatched(db, "community_memberships", memberships, 1000);
  for (const c of communities) {
    check(await db.from("communities").update({ member_count: counts.get(c.id) ?? 0, activity_score: (counts.get(c.id) ?? 0) * 0.5 }).eq("id", c.id), "community_counts");
  }
}

async function stepContent(db: Db, world: WorldRow): Promise<void> {
  // Remove any partial seed content from a failed attempt.
  check(await db.from("world_events").delete().eq("world_id", world.id), "clean_events");
  check(await db.from("trends").delete().eq("world_id", world.id), "clean_trends");
  check(await db.from("posts").delete().eq("world_id", world.id).eq("author_type", "sim"), "clean_posts");

  const sims = await loadAllSims(db, world.id);
  const rng = new Rng(`${world.seed}:content`);
  const topics = THEME_TOPICS[world.world_theme as WorldTheme];
  const now = Date.now();

  // Pick 3 seed trends from theme topics.
  const trendTopics = rng.sample(topics, 3);
  const trendTags = trendTopics.map((t) => ({ topic: t, tag: rng.pick(vocabFor(t).tags) }));

  const active = rng.sample(sims, Math.min(sims.length, 70)).sort((a, b) => b.fame - a.fame);
  const postRows: Record<string, unknown>[] = [];
  const trendLinks: { tag: string; idx: number; authorId: string }[] = [];
  active.forEach((s, i) => {
    const r = rng.fork(`p${i}`);
    const count = r.int(1, 2);
    for (let k = 0; k < count; k++) {
      const trend = r.chance(0.3) ? r.pick(trendTags.filter((t) => s.interests.includes(t.topic)).concat(trendTags.slice(0, 1))) : null;
      const topic = trend?.topic ?? r.pick(s.interests);
      const intent = trend ? "trend" : chooseIntent(s.archetype, s.personality_traits, r, false);
      const content = generatePost(intent, { topic, tag: trend?.tag }, voiceOf(s), r);
      const eng = abstractEngagement(s.follower_count_cache, 0.5, () => r.next());
      if (trend) trendLinks.push({ tag: trend.tag, idx: postRows.length, authorId: s.id });
      postRows.push({
        world_id: world.id, author_type: "sim", author_simulated_account_id: s.id, post_type: "post", content, topic_id: topic,
        stance: intent, like_count: eng.likes, reply_count: 0, repost_count: eng.reposts, view_count: eng.views,
        created_at: isoMinutesAgo(r.int(5, 18 * 60), now), sim_tick: 0,
      });
    }
  });
  const inserted = check(await db.from("posts").insert(postRows, { defaultToNull: false }).select("id, author_simulated_account_id, topic_id, content, created_at"), "seed_posts") as { id: string; author_simulated_account_id: string; topic_id: string; content: string; created_at: string }[];

  // Seed replies between sims so conversations exist from the start.
  const byId = new Map(sims.map((s) => [s.id, s]));
  const replies: Record<string, unknown>[] = [];
  const replyCounts = new Map<string, number>();
  inserted.forEach((p, i) => {
    const r = rng.fork(`r${i}`);
    if (!r.chance(0.35)) return;
    const n = r.int(1, 3);
    for (let k = 0; k < n; k++) {
      const replier = r.weighted(sims, (o) => (o.id === p.author_simulated_account_id ? 0 : o.interests.includes(p.topic_id) ? 3 : 0.2));
      const stance = r.pick<ReplyStance>(["praise", "agree_add", "disagree", "joke", "question", "relate", "critique"]);
      const content = generateReply(stance, { topic: p.topic_id }, voiceOf(replier), r);
      const created = new Date(new Date(p.created_at).getTime() + r.int(3, 120) * 60_000);
      replies.push({
        world_id: world.id, author_type: "sim", author_simulated_account_id: replier.id, post_type: "reply", parent_post_id: p.id, root_post_id: p.id,
        content, topic_id: p.topic_id, stance, like_count: r.int(0, 12), created_at: new Date(Math.min(created.getTime(), now - 60_000)).toISOString(),
      });
      replyCounts.set(p.id, (replyCounts.get(p.id) ?? 0) + 1);
    }
  });
  if (replies.length) await insertBatched(db, "posts", replies);
  for (const [pid, n] of replyCounts) check(await db.rpc("adjust_post_counts", { p: pid, d_like: 0, d_reply: n, d_repost: 0, d_quote: 0, d_view: 0 }), "seed_reply_counts");

  // Trends from seeded hashtag activity.
  for (const t of trendTags) {
    const links = trendLinks.filter((l) => l.tag === t.tag);
    const authors = new Set(links.map((l) => l.authorId)).size;
    const trend = check(await db.from("trends").insert({
      world_id: world.id, name: t.tag, slug: t.tag.replace("#", "").toLowerCase(), topic_id: t.topic, category: t.topic,
      description: `People are debating ${vocabFor(t.topic).name} under ${t.tag}.`, activity_score: 20 + links.length * 6,
      growth_rate: 0.2, post_count: links.length, participant_count: authors, status: links.length > 4 ? "rising" : "emerging",
      started_at: isoMinutesAgo(rng.int(60, 600), now),
    }).select("id").single(), "seed_trend") as { id: string };
    if (links.length) {
      check(await db.from("trend_posts").insert(links.map((l) => ({ world_id: world.id, trend_id: trend.id, post_id: inserted[l.idx].id }))), "seed_trend_posts");
    }
  }

  // Independent seed events: a feud, a breakout, and a platform-wide conversation.
  const fighters = sims.filter((s) => s.personality_traits.conflict_tolerance > 0.55 && s.fame > 10).sort((a, b) => b.fame - a.fame);
  if (fighters.length >= 2) {
    const [a, b] = [fighters[0], fighters[1 + rng.int(0, Math.min(3, fighters.length - 2))]];
    const topic = a.interests.find((i) => b.interests.includes(i)) ?? a.interests[0];
    const r = rng.fork("feud");
    const jabA = generatePost("feud_jab", { topic, mention: `@${b.username}` }, voiceOf(a), r);
    const jabB = generatePost("feud_jab", { topic, mention: `@${a.username}` }, voiceOf(b), r);
    const posts = check(await db.from("posts").insert([
      { world_id: world.id, author_type: "sim", author_simulated_account_id: a.id, post_type: "post", content: jabA, topic_id: topic, stance: "feud_jab", like_count: r.int(40, 300), reply_count: 0, created_at: isoMinutesAgo(200, now) },
      { world_id: world.id, author_type: "sim", author_simulated_account_id: b.id, post_type: "post", content: jabB, topic_id: topic, stance: "feud_jab", like_count: r.int(40, 300), reply_count: 0, created_at: isoMinutesAgo(150, now) },
    ], { defaultToNull: false }).select("id"), "seed_feud_posts") as { id: string }[];
    const evId = await createEvent(db, world, {
      type: "public_feud", category: "conflicts", title: "Public feud",
      description: `@${a.username} and @${b.username} traded jabs over ${vocabFor(topic).name}. Their followers started picking sides.`,
      severity: 3, accountIds: [a.id, b.id], postIds: posts.map((p) => p.id), status: "escalating", data: { topic, a: a.username, b: b.username },
    });
    await seedRivalry(db, world.id, a.id, b.id, evId);
    await seedRivalry(db, world.id, b.id, a.id, evId);
  }
  const risers = sims.filter((s) => ["small_creator", "artist", "memer"].includes(s.archetype)).sort((x, y) => y.fame - x.fame);
  if (risers.length) {
    const s = risers[0];
    const prev = s.fame;
    const nextFame = Math.min(100, prev + 6);
    check(await db.from("simulated_accounts").update({ fame: nextFame, follower_count_cache: Math.round(s.follower_count_cache * 1.4) }).eq("id", s.id), "seed_breakout");
    const ev = await createEvent(db, world, {
      type: "breakout_creator", category: "creator", title: "Breakout creator",
      description: `@${s.username} had a breakout week, growing their audience by 40% after a run of ${vocabFor(s.interests[0]).name} posts.`,
      severity: 2, accountIds: [s.id], data: { topic: s.interests[0] },
    });
    await recordEffect(db, world.id, ev, "sim", s.id, "fame", prev, nextFame);
  }
  const newsTopic = rng.pick(topics);
  await createEvent(db, world, {
    type: "platform_conversation", category: "platform", title: "Platform-wide conversation",
    description: `Everyone is talking about how ${rng.pick(vocabFor(newsTopic).news)}.`, severity: 2, data: { topic: newsTopic },
  });
}

async function seedRivalry(db: Db, worldId: string, aId: string, bId: string, eventId: string): Promise<void> {
  check(await db.from("relationships").upsert({
    world_id: worldId, account_a_type: "sim", account_a_id: aId, account_b_type: "sim", account_b_id: bId,
    relationship_score: -35, peak_score: 0, relationship_status: "rival", interaction_count: 3, hostile_count: 2, last_interaction_at: new Date().toISOString(),
  }, { onConflict: "world_id,account_a_type,account_a_id,account_b_type,account_b_id", ignoreDuplicates: true }), "seed_rivalry");
  check(await db.from("account_memories").insert({
    world_id: worldId, simulated_account_id: aId, related_entity_type: "sim", related_entity_id: bId, memory_type: "public_dispute",
    summary: "Traded public jabs in an escalating feud.", importance: 0.8, sentiment: -0.7, source_event_id: eventId,
  }), "seed_rivalry_memory");
}
