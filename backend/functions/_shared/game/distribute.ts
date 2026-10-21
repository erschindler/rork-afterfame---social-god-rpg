/**
 * Multi-stage post distribution for player posts:
 * 1 initial exposure -> 2 second-degree via amplifiers/trends -> 3 wider/broad.
 * Each stage is a job; later stages run only if engagement earns it.
 */
import { check, type Db, log } from "../http.ts";
import { clamp, Rng } from "../sim/rng.ts";
import { LIMITS, TICK_SECONDS } from "../sim/config.ts";
import type { PostSignals } from "../sim/analyze.ts";
import { type Candidate, engagementRate, evaluateCandidate, type Reaction, shouldAdvance, type Via } from "../sim/engagement.ts";
import { extractHook, generatePost, generateQuote, generateReply, type ReplyStance } from "../sim/text.ts";
import { stageDeltas } from "../sim/reputation.ts";
import { rephrase, readModelConfig } from "../sim/llm.ts";
import { COMMUNITY_DEFS } from "../sim/communities.ts";
import { SIM_COLUMNS, type PlayerRow, type PostRow, type SimRow, type WorldRow } from "./types.ts";
import { applyReputation, createEvent, notify, population, refreshPlayerCounts, remember, updateRelationship } from "./store.ts";
import { voiceOf } from "./util.ts";
import { evaluateAchievements } from "./achievements.ts";
import { progressChallenge } from "./challenges.ts";

const SUPPORTIVE = new Set<ReplyStance>(["praise", "agree_add", "relate", "defend", "recognize"]);
const CRITICAL = new Set<ReplyStance>(["disagree", "critique", "dunk", "evidence_request"]);
const RIGOROUS = new Set(["expert", "journalist", "critic", "moderator"]);

export interface StageSummary {
  stage: number;
  seen: number;
  outsideSeen: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  newFollowers: number;
  lostFollowers: number;
  advanced: boolean;
  viral: boolean;
}

async function loadCandidates(db: Db, world: WorldRow, post: PostRow, player: PlayerRow, stage: number, rng: Rng): Promise<{ sims: SimRow[]; via: Map<string, Via>; followerIds: Set<string> }> {
  const topic = post.topic_id ?? "everyday";
  const via = new Map<string, Via>();
  const followerRows = check(await db.from("follows").select("follower_simulated_account_id").eq("followed_player_id", player.id).eq("follower_type", "sim"), "load_player_followers") as { follower_simulated_account_id: string }[];
  const followerIds = new Set(followerRows.map((r) => r.follower_simulated_account_id));
  const seenRows = check(await db.from("post_interactions").select("actor_simulated_account_id").eq("post_id", post.id).eq("interaction_type", "seen"), "load_seen") as { actor_simulated_account_id: string }[];
  const seen = new Set(seenRows.map((r) => r.actor_simulated_account_id));
  const blocked = check(await db.from("player_filters").select("target_simulated_account_id").eq("player_id", player.id).eq("kind", "block"), "load_blocks") as { target_simulated_account_id: string }[];
  const excluded = new Set([...seen, ...blocked.map((b) => b.target_simulated_account_id)]);
  const add = (id: string, v: Via) => {
    if (!excluded.has(id) && !via.has(id)) via.set(id, v);
  };

  const signals = post.signals as unknown as PostSignals;
  if (stage === 1) {
    if (signals.mentions?.length) {
      const mentioned = check(await db.from("simulated_accounts").select("id").eq("world_id", world.id).in("username", signals.mentions), "load_mentioned") as { id: string }[];
      mentioned.forEach((m) => add(m.id, "mention"));
    }
    rng.sample([...followerIds], 60).forEach((id) => add(id, "follower"));
    const interested = check(await db.from("simulated_accounts").select("id").eq("world_id", world.id).contains("interests", [topic]).limit(300), "load_interested") as { id: string }[];
    rng.sample(interested, 30).forEach((r) => add(r.id, "interest"));
    const def = COMMUNITY_DEFS[topic];
    if (def) {
      const community = check(await db.from("communities").select("id").eq("world_id", world.id).eq("slug", def.slug).maybeSingle(), "load_topic_community") as { id: string } | null;
      if (community) {
        const members = check(await db.from("community_memberships").select("simulated_account_id").eq("community_id", community.id).eq("member_type", "sim").limit(200), "load_comm_members") as { simulated_account_id: string }[];
        rng.sample(members, 15).forEach((m) => add(m.simulated_account_id, "community"));
      }
    }
  } else if (stage === 2) {
    const amps = check(await db.from("post_interactions").select("actor_simulated_account_id").eq("post_id", post.id).eq("interaction_type", "repost"), "load_amps") as { actor_simulated_account_id: string }[];
    const quoters = check(await db.from("posts").select("author_simulated_account_id").eq("quoted_post_id", post.id).eq("author_type", "sim"), "load_quoters") as { author_simulated_account_id: string }[];
    const ampIds = [...amps.map((a) => a.actor_simulated_account_id), ...quoters.map((q) => q.author_simulated_account_id)].filter(Boolean);
    if (ampIds.length) {
      const second = check(await db.from("follows").select("follower_simulated_account_id").in("followed_simulated_account_id", ampIds.slice(0, 50)).eq("follower_type", "sim").limit(600), "load_second_degree") as { follower_simulated_account_id: string }[];
      rng.sample(second.map((s) => s.follower_simulated_account_id), 70).forEach((id) => add(id, followerIds.has(id) ? "follower" : "second_degree"));
    }
    const interested = check(await db.from("simulated_accounts").select("id").eq("world_id", world.id).contains("interests", [topic]).limit(400), "load_interested2") as { id: string }[];
    rng.sample(interested, 25).forEach((r) => add(r.id, signals.hashtags?.length ? "trend" : "interest"));
  } else {
    const pop = population(world);
    const start = rng.int(0, Math.max(0, pop - LIMITS.stage3Candidates));
    const broad = check(await db.from("simulated_accounts").select("id").eq("world_id", world.id).gte("seq", start).lt("seq", start + LIMITS.stage3Candidates), "load_broad") as { id: string }[];
    broad.forEach((r) => add(r.id, "broad"));
  }

  const ids = [...via.keys()].slice(0, stage === 1 ? LIMITS.stage1Candidates + 20 : stage === 2 ? LIMITS.stage2Candidates : LIMITS.stage3Candidates);
  if (!ids.length) return { sims: [], via, followerIds };
  const sims: SimRow[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    sims.push(...(check(await db.from("simulated_accounts").select(SIM_COLUMNS).in("id", ids.slice(i, i + 100)), "load_candidate_sims") as SimRow[]));
  }
  return { sims: sims.filter((s) => s.account_status === "active"), via, followerIds };
}

export async function processDistribution(db: Db, world: WorldRow, postId: string, stage: number): Promise<StageSummary | null> {
  const post = check(await db.from("posts").select("*").eq("id", postId).maybeSingle(), "load_post") as PostRow | null;
  if (!post || post.deleted_at || post.author_type !== "player" || !post.author_player_id) return null;
  let player = check(await db.from("player_world_state").select("*").eq("id", post.author_player_id).single(), "load_author") as PlayerRow;
  const rng = new Rng(`${world.seed}:dist:${post.id}:${stage}`);
  const signals = post.signals as unknown as PostSignals;
  const pop = population(world);
  const { sims, via, followerIds } = await loadCandidates(db, world, post, player, stage, rng);
  const simIds = sims.map((s) => s.id);

  // Relationship + memory context toward the player
  const rels = simIds.length
    ? check(await db.from("relationships").select("account_a_id, relationship_score").eq("world_id", world.id).eq("account_b_id", player.id).in("account_a_id", simIds), "load_rels") as { account_a_id: string; relationship_score: number }[]
    : [];
  const relMap = new Map(rels.map((r) => [r.account_a_id, r.relationship_score]));
  const mems = simIds.length
    ? check(await db.from("account_memories").select("simulated_account_id, sentiment, summary").eq("related_entity_id", player.id).in("simulated_account_id", simIds).order("occurred_at", { ascending: false }).limit(300), "load_memories") as { simulated_account_id: string; sentiment: number; summary: string }[]
    : [];
  const memMap = new Map<string, { pos: number; neg: number; last?: string }>();
  for (const m of mems) {
    const e = memMap.get(m.simulated_account_id) ?? { pos: 0, neg: 0 };
    if (m.sentiment > 0.2) e.pos++;
    if (m.sentiment < -0.2) e.neg++;
    e.last ??= m.summary;
    memMap.set(m.simulated_account_id, e);
  }
  const norms = COMMUNITY_DEFS[post.topic_id ?? ""]?.norms;

  const prior = { likes: post.like_count, reposts: post.repost_count, views: post.view_count };
  const socialProof = clamp((prior.likes + prior.reposts * 3) / Math.max(10, prior.views + 10), 0, 1);
  const reactions: { sim: SimRow; r: Reaction }[] = [];
  for (const sim of sims) {
    const m = memMap.get(sim.id);
    const c: Candidate = {
      id: sim.id, archetype: sim.archetype, traits: sim.personality_traits, interests: sim.interests, expertise: sim.expertise,
      fame: sim.fame, postsPerDay: sim.activity_profile?.postsPerDay ?? 1, followsAuthor: followerIds.has(sim.id), via: via.get(sim.id) ?? "broad",
      relationship: relMap.get(sim.id) ?? 0, hostileMemories: m?.neg ?? 0, positiveMemories: m?.pos ?? 0, norms: via.get(sim.id) === "community" ? norms : undefined,
    };
    const r = evaluateCandidate(c, signals, {
      fame: player.fame, credibility: player.credibility, infamy: player.infamy, nicheTopic: player.niche_topic, nicheAuthority: player.niche_authority,
      fatigue: player.fatigue, followerCount: player.follower_count, population: pop,
    }, { stage, socialProof, isPlayerAuthor: true }, rng.fork(sim.id));
    if (r.seen) reactions.push({ sim, r });
  }

  // Bound the visible output so threads stay readable and believable.
  const replyers = reactions.filter((x) => x.r.reply).sort((a, b) => Math.abs(b.r.sentiment) - Math.abs(a.r.sentiment)).slice(0, stage === 1 ? 6 : 4);
  const quoters = reactions.filter((x) => x.r.quote).slice(0, 2);
  const replySet = new Set(replyers.map((x) => x.sim.id));
  const quoteSet = new Set(quoters.map((x) => x.sim.id));
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const interactions: Record<string, unknown>[] = [];
  let likes = 0, reposts = 0, newFollowers = 0, lostFollowers = 0, outsideSeen = 0, expertApprovals = 0, expertCritiques = 0, supportive = 0, critical = 0, qPos = 0, qNeg = 0;
  let notable: SimRow | null = null;
  for (const { sim, r } of reactions) {
    interactions.push({ world_id: world.id, post_id: post.id, actor_type: "sim", actor_simulated_account_id: sim.id, interaction_type: "seen", created_at: nowIso });
    if (!followerIds.has(sim.id)) outsideSeen++;
    if (r.like) {
      likes++;
      interactions.push({ world_id: world.id, post_id: post.id, actor_type: "sim", actor_simulated_account_id: sim.id, interaction_type: "like", created_at: nowIso });
      if (RIGOROUS.has(sim.archetype) || sim.expertise.includes(signals.topic)) expertApprovals++;
    }
    if (r.repost) {
      reposts++;
      interactions.push({ world_id: world.id, post_id: post.id, actor_type: "sim", actor_simulated_account_id: sim.id, interaction_type: "repost", created_at: nowIso });
      if (sim.fame >= 45 && (!notable || sim.fame > notable.fame)) notable = sim;
    }
  }
  await insertIgnoringDuplicates(db, "post_interactions", interactions);

  const modelCfg = await modelConfigFor(db, world.id);
  const hook = extractHook(post.content);
  const replyRows: Record<string, unknown>[] = [];
  for (const { sim, r } of replyers) {
    const stance = r.reply!;
    if (SUPPORTIVE.has(stance)) supportive++;
    if (CRITICAL.has(stance)) {
      critical++;
      if (RIGOROUS.has(sim.archetype) && (stance === "critique" || stance === "evidence_request")) expertCritiques++;
    }
    let content = generateReply(stance, { topic: signals.topic, hook, memory: memMap.get(sim.id)?.last ? "that earlier thread" : undefined }, voiceOf(sim), rng.fork(`reply${sim.id}`));
    content = await rephrase(modelCfg, content, `${sim.display_name}, ${sim.archetype}, ${sim.communication_style} tone`, `Replying (${stance}) to: ${post.content}`);
    replyRows.push({
      world_id: world.id, author_type: "sim", author_simulated_account_id: sim.id, post_type: "reply", parent_post_id: post.id, root_post_id: post.root_post_id ?? post.id,
      content, topic_id: post.topic_id, stance, sim_tick: world.current_tick, created_at: new Date(now + replyRows.length * 1000).toISOString(),
    });
  }
  const quoteRows: Record<string, unknown>[] = [];
  for (const { sim, r } of quoters) {
    const stance = r.quote!;
    if (SUPPORTIVE.has(stance) || stance === "joke") qPos++;
    else qNeg++;
    if (sim.fame >= 45 && (!notable || sim.fame > notable.fame)) notable = sim;
    let content = generateQuote(stance, { topic: signals.topic, hook }, voiceOf(sim), rng.fork(`quote${sim.id}`));
    content = await rephrase(modelCfg, content, `${sim.display_name}, ${sim.archetype}`, `Quote-posting (${stance}): ${post.content}`);
    quoteRows.push({
      world_id: world.id, author_type: "sim", author_simulated_account_id: sim.id, post_type: "quote", quoted_post_id: post.id, content, topic_id: post.topic_id,
      stance, sim_tick: world.current_tick, like_count: Math.round(sim.follower_count_cache * 0.01 * rng.range(0.5, 2)), view_count: Math.round(sim.follower_count_cache * 0.2),
    });
  }
  if (replyRows.length) check(await db.from("posts").insert(replyRows, { defaultToNull: false }), "insert_sim_replies");
  if (quoteRows.length) check(await db.from("posts").insert(quoteRows, { defaultToNull: false }), "insert_sim_quotes");

  // Follows / unfollows (bounded per stage to avoid unrealistic bursts)
  const followRows: Record<string, unknown>[] = [];
  const unfollowIds: string[] = [];
  const followCap = Math.max(2, Math.round(reactions.length * 0.12));
  for (const { sim, r } of reactions) {
    if (r.follow && followRows.length < followCap && !followerIds.has(sim.id)) {
      followRows.push({ world_id: world.id, follower_type: "sim", follower_simulated_account_id: sim.id, followed_type: "player", followed_player_id: player.id, reason: "organic" });
    }
    if (r.unfollow && followerIds.has(sim.id)) unfollowIds.push(sim.id);
  }
  for (const f of followRows) {
    const res = await db.from("follows").insert(f);
    if (!res.error) newFollowers++;
  }
  if (unfollowIds.length) {
    const del = check(await db.from("follows").delete().eq("followed_player_id", player.id).in("follower_simulated_account_id", unfollowIds).select("id"), "unfollow") as unknown[];
    lostFollowers = del.length;
  }

  // Counters
  check(await db.rpc("adjust_post_counts", { p: post.id, d_like: likes, d_reply: replyRows.length, d_repost: reposts, d_quote: quoteRows.length, d_view: reactions.length }), "adjust_counts");

  // Relationships & memories for meaningful reactions
  for (const { sim, r } of reactions) {
    const kinds: { kind: string; hostile?: boolean; reason: string; memory?: { type: string; importance: number; sentiment: number; summary: string } }[] = [];
    if (replySet.has(sim.id) && r.reply) {
      const s = r.reply;
      kinds.push({
        kind: s, hostile: s === "dunk" || s === "critique", reason: `${SUPPORTIVE.has(s) ? "supported" : CRITICAL.has(s) ? "pushed back on" : "replied to"} your post`,
        memory: SUPPORTIVE.has(s) || CRITICAL.has(s) ? { type: CRITICAL.has(s) ? "disagreement" : "positive_interaction", importance: s === "dunk" || s === "defend" ? 0.6 : 0.35, sentiment: SUPPORTIVE.has(s) ? 0.5 : -0.5, summary: `${CRITICAL.has(s) ? "Argued with" : "Backed"} @${player.username} about ${hook}` } : undefined,
      });
    }
    if (quoteSet.has(sim.id) && r.quote) {
      const pos = SUPPORTIVE.has(r.quote) || r.quote === "joke";
      kinds.push({ kind: pos ? "quote_positive" : "quote_negative", hostile: !pos, reason: pos ? "quote-posted you approvingly" : "publicly quote-posted you critically", memory: { type: pos ? "amplified" : "public_dispute", importance: 0.6, sentiment: pos ? 0.6 : -0.7, summary: `${pos ? "Amplified" : "Publicly criticized"} @${player.username}'s post about ${hook}` } });
    }
    if (r.repost) kinds.push({ kind: "repost", reason: "reposted your post" });
    if (r.follow && followRows.some((f) => f.follower_simulated_account_id === sim.id)) kinds.push({ kind: "follow", reason: "started following you" });
    if (r.unfollow && unfollowIds.includes(sim.id)) kinds.push({ kind: "unfollow", reason: r.reasons.at(-1) ?? "lost interest" });
    for (const k of kinds) {
      await updateRelationship(db, world.id, { aType: "sim", aId: sim.id, bType: "player", bId: player.id, kind: k.kind, reason: k.reason, postId: post.id, hostile: k.hostile });
      if (k.memory) await remember(db, world.id, sim.id, { entityType: "player", entityId: player.id, type: k.memory.type, summary: k.memory.summary, importance: k.memory.importance, sentiment: k.memory.sentiment, postId: post.id });
    }
  }

  // Mentions: the mentioned account feels it either way
  if (stage === 1 && signals.mentions?.length) {
    const mentioned = sims.filter((s) => signals.mentions.includes(s.username));
    for (const s of mentioned) {
      const hostile = signals.aggression > 0.3 || (signals.controversy > 0.5 && signals.positivity < 0.2);
      const rel = await updateRelationship(db, world.id, { aType: "sim", aId: s.id, bType: "player", bId: player.id, kind: hostile ? "player_mention_hostile" : "player_mention_positive", reason: hostile ? "you called them out publicly" : "you mentioned them positively", postId: post.id, hostile });
      await remember(db, world.id, s.id, { entityType: "player", entityId: player.id, type: hostile ? "public_dispute" : "positive_interaction", summary: hostile ? `@${player.username} called me out publicly` : `@${player.username} gave me a shoutout`, importance: hostile ? 0.8 : 0.5, sentiment: hostile ? -0.8 : 0.6, postId: post.id });
      if (hostile && (rel.status === "rival" || rel.status === "public_enemy" || rel.score <= -15)) await startPlayerFeud(db, world, player, s, post, rng);
    }
  }

  // Spread record
  const rate = engagementRate(reactions.length, likes, replyRows.length, reposts, quoteRows.length);
  const label = stage === 1 ? "Initial exposure" : stage === 2 ? "Second-degree audience" : "Wider distribution";
  const detail = stage === 1 ? "Seen in home feeds of followers and interested accounts" : stage === 2 ? "Reached via followers of engagers" : "Pushed into broader feeds";
  await upsertSpread(db, world, post.id, `stage${stage}`, label, detail, reactions.length);
  if (likes + replyRows.length + reposts > 0) await upsertSpread(db, world, post.id, `engagement${stage}`, stage === 1 ? "Early engagement" : "Continued engagement", "Likes, replies, reposts", likes + replyRows.length + reposts + quoteRows.length);
  if (notable) await upsertSpread(db, world, post.id, "notable", "Quoted by notable account", `@${notable.username} amplified this`, 0);

  // Reputation
  const deltas = stageDeltas({
    stage, seen: reactions.length, outsideSeen, likes, supportive, critical, reposts, quotesPositive: qPos, quotesNegative: qNeg, newFollowers, lostFollowers,
    notableAmplifier: notable?.username ?? null, expertApprovals, expertCritiques, population: pop, signals, isNicheTopic: player.niche_topic === signals.topic,
  }, player);
  check(await db.from("player_world_state").update({ total_reach: player.total_reach + reactions.length, outside_reach: player.outside_reach + outsideSeen }).eq("id", player.id), "update_reach");
  await refreshPlayerCounts(db, player.id);
  player = check(await db.from("player_world_state").select("*").eq("id", player.id).single(), "reload_player") as PlayerRow;

  // Viral detection (cumulative)
  const totals = check(await db.from("posts").select("view_count, repost_count, like_count, quote_count, is_viral").eq("id", post.id).single(), "load_totals") as { view_count: number; repost_count: number; like_count: number; quote_count: number; is_viral: boolean };
  let viral = false;
  if (!totals.is_viral && (totals.view_count >= Math.max(30, pop * 0.3) || totals.repost_count + totals.quote_count >= 6)) {
    viral = true;
    check(await db.from("posts").update({ is_viral: true, spread_stage: "viral" }).eq("id", post.id), "mark_viral");
    check(await db.from("player_world_state").update({ viral_posts: player.viral_posts + 1 }).eq("id", player.id), "inc_viral");
    player.viral_posts += 1;
    const ev = await createEvent(db, world, {
      type: "viral_post", category: "trends", title: "Your post went viral",
      description: `@${player.username}'s post about ${hook} spread to ${totals.view_count} accounts${notable ? ` after @${notable.username} amplified it` : ""}.`,
      severity: 3, involvesPlayer: true, sourceType: "post", sourceId: post.id, postIds: [post.id], accountIds: notable ? [notable.id] : [],
    });
    deltas.push({ attribute: "fame", delta: 2, reason: "Viral post brought new recognition" });
    await notify(db, world.id, player.user_id, { type: "major_event", title: "Your post is spreading fast", body: `Seen by ${totals.view_count} accounts and counting.`, sourceType: "post", sourceId: post.id, priority: 3 });
    await evaluateAchievements(db, world, player, { viralPost: true, lowEffortViral: signals.lowEffort, sourcePostId: post.id, sourceEventId: ev });
  }
  if (notable) {
    const ev = await createEvent(db, world, {
      type: "notable_mention", category: "reputation", title: "Quoted by a notable account",
      description: `@${notable.username} amplified @${player.username}'s post about ${hook} to their audience.`, severity: 2, involvesPlayer: true,
      sourceType: "post", sourceId: post.id, postIds: [post.id], accountIds: [notable.id],
    });
    await notify(db, world.id, player.user_id, { type: "mention", title: `@${notable.username} amplified your post`, body: `${notable.display_name} has ${notable.follower_count_cache.toLocaleString()} followers.`, sourceType: "post", sourceId: post.id, actorId: notable.id, priority: 3 });
    await evaluateAchievements(db, world, player, { notableMention: true, sourcePostId: post.id, sourceEventId: ev });
  }
  if (supportive + qPos >= 3 && critical + qNeg >= 3) {
    await createEvent(db, world, {
      type: "controversial_statement", category: "conflicts", title: "Divisive post",
      description: `@${player.username}'s post about ${hook} split the room: ${supportive + qPos} backed it, ${critical + qNeg} pushed back.`,
      severity: 2, involvesPlayer: true, sourceType: "post", sourceId: post.id, postIds: [post.id], data: { choices: ["clarify", "stand_firm", "ignore"] },
    });
    await evaluateAchievements(db, world, player, { divisivePost: true, sourcePostId: post.id });
  }
  if (signals.aggression > 0.35 && critical + qNeg >= 3) {
    await createEvent(db, world, {
      type: "public_backlash", category: "reputation", title: "Public backlash",
      description: `@${player.username} drew backlash for a hostile post about ${hook}. ${critical + qNeg} accounts responded critically.`,
      severity: 3, involvesPlayer: true, sourceType: "post", sourceId: post.id, postIds: [post.id], status: "escalating",
      data: { choices: ["apologize", "stand_firm", "ignore"], admiration_at: player.admiration },
    });
    await notify(db, world.id, player.user_id, { type: "public_controversy", title: "You're facing backlash", body: "Decide how to respond in World Events.", sourceType: "post", sourceId: post.id, priority: 3 });
  }

  player = await applyReputation(db, world, player, deltas, { postId: post.id, snapshotLabel: viral ? "Viral post" : notable ? `Amplified by @${notable.username}` : null });

  // Meme spread: amplifiers adopt the player's hashtag
  if (stage >= 2 && signals.hashtags?.length && (reposts > 0 || quoteRows.length > 0)) {
    const adopters = reactions.filter((x) => x.r.like || x.r.repost).slice(0, rng.int(2, 4));
    const tag = signals.hashtags[0];
    const rows = adopters.map(({ sim }) => ({
      world_id: world.id, author_type: "sim", author_simulated_account_id: sim.id, post_type: "post",
      content: generatePost("trend", { topic: signals.topic, tag }, voiceOf(sim), rng.fork(`adopt${sim.id}`)), topic_id: signals.topic, stance: "trend", sim_tick: world.current_tick,
      like_count: Math.round(sim.follower_count_cache * 0.008), view_count: Math.round(sim.follower_count_cache * 0.15),
    }));
    if (rows.length) check(await db.from("posts").insert(rows, { defaultToNull: false }), "insert_adopters");
  }

  // Notifications (batched)
  if (likes) await notify(db, world.id, player.user_id, { type: "like", title: `${post.like_count + likes} likes on your post`, body: post.content.slice(0, 90), sourceType: "post", sourceId: post.id, batchKey: `likes:${post.id}` });
  if (reposts) await notify(db, world.id, player.user_id, { type: "repost", title: `${post.repost_count + reposts} reposts of your post`, body: post.content.slice(0, 90), sourceType: "post", sourceId: post.id, batchKey: `reposts:${post.id}` });
  for (const { sim, r } of replyers) await notify(db, world.id, player.user_id, { type: "reply", title: `@${sim.username} replied`, body: replyRows.find((x) => x.author_simulated_account_id === sim.id)?.content as string ?? "", sourceType: "post", sourceId: post.id, actorId: sim.id, priority: CRITICAL.has(r.reply!) ? 2 : 1 });
  for (const { sim } of quoters) await notify(db, world.id, player.user_id, { type: "quote", title: `@${sim.username} quoted your post`, body: quoteRows.find((x) => x.author_simulated_account_id === sim.id)?.content as string ?? "", sourceType: "post", sourceId: post.id, actorId: sim.id, priority: 2 });
  if (newFollowers) await notify(db, world.id, player.user_id, { type: "new_follower", title: "New followers", body: `${newFollowers} new ${newFollowers === 1 ? "account" : "accounts"} followed you`, batchKey: `follows:${new Date().toISOString().slice(0, 10)}` });
  if (newFollowers) await progressChallenge(db, player, "gain_follower", newFollowers);
  if (outsideSeen > 0 && likes > 0) await progressChallenge(db, player, "outside_reach", 1);
  await evaluateAchievements(db, world, player, { sourcePostId: post.id });

  // Advance or fade
  const advanced = stage < 3 && shouldAdvance(stage, rate, reposts + quoteRows.length, !!notable, rng.fork("advance"));
  if (advanced) {
    const delay = TICK_SECONDS[world.world_pace] * (stage === 1 ? 0.35 : 0.8) * 1000;
    await scheduleJob(db, world.id, "distribute_post", { post_id: post.id, stage: stage + 1 }, new Date(now + delay), `dist:${post.id}:${stage + 1}`);
    check(await db.from("posts").update({ spread_stage: viral ? "viral" : `stage${stage + 1}` }).eq("id", post.id), "update_stage");
  } else {
    const hours = Math.max(1, Math.round((now - new Date(post.created_at).getTime()) / 3_600_000));
    await upsertSpread(db, world, post.id, "faded", `Faded after ${hours} ${hours === 1 ? "hour" : "hours"}`, "Activity returned to baseline", 0);
    if (!viral && !totals.is_viral) check(await db.from("posts").update({ spread_stage: "faded" }).eq("id", post.id), "update_faded");
  }

  log("info", "distribution_stage", { world: world.id, post: post.id, stage, seen: reactions.length, likes, replies: replyRows.length, reposts, quotes: quoteRows.length, newFollowers, lostFollowers, advanced });
  return { stage, seen: reactions.length, outsideSeen, likes, replies: replyRows.length, reposts, quotes: quoteRows.length, newFollowers, lostFollowers, advanced, viral };
}

/** Insert rows; if a uniqueness conflict occurs (e.g. a retried job), fall back to row-by-row and skip duplicates. */
export async function insertIgnoringDuplicates(db: Db, table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  const res = await db.from(table).insert(rows, { defaultToNull: false });
  if (!res.error) return;
  if (res.error.code !== "23505") check(res, `insert_${table}`);
  for (const row of rows) {
    const one = await db.from(table).insert(row);
    if (one.error && one.error.code !== "23505") check(one, `insert_one_${table}`);
  }
}

async function upsertSpread(db: Db, world: WorldRow, postId: string, stage: string, label: string, detail: string, count: number): Promise<void> {
  check(await db.from("post_spread").upsert({ world_id: world.id, post_id: postId, stage, label, detail, count, sim_tick: world.current_tick }, { onConflict: "post_id,stage" }), "upsert_spread");
}

export async function scheduleJob(db: Db, worldId: string, type: string, payload: Record<string, unknown>, at: Date, key: string): Promise<void> {
  const res = await db.from("simulation_jobs").insert({ world_id: worldId, job_type: type, payload, scheduled_at: at.toISOString(), idempotency_key: key });
  if (res.error && res.error.code !== "23505") check(res, "schedule_job");
}

async function modelConfigFor(db: Db, worldId: string) {
  const settings = check(await db.from("world_settings").select("text_generation_mode").eq("world_id", worldId).maybeSingle(), "load_settings") as { text_generation_mode: string } | null;
  if (settings?.text_generation_mode !== "model") return null;
  return readModelConfig((k) => Deno.env.get(k));
}

/** A hostile exchange escalates into a public feud event and a public response. */
export async function startPlayerFeud(db: Db, world: WorldRow, player: PlayerRow, sim: SimRow, post: PostRow, rng: Rng): Promise<void> {
  const existing = check(await db.from("world_events").select("id").eq("world_id", world.id).eq("event_type", "public_feud").eq("involves_player", true)
    .contains("related_account_ids", [sim.id]).in("status", ["active", "escalating"]).maybeSingle(), "find_feud") as { id: string } | null;
  const jab = generatePost("feud_jab", { topic: post.topic_id ?? sim.interests[0], mention: `@${player.username}` }, voiceOf(sim), rng.fork("feudjab"));
  const reply = check(await db.from("posts").insert({
    world_id: world.id, author_type: "sim", author_simulated_account_id: sim.id, post_type: "quote", quoted_post_id: post.id, content: jab, topic_id: post.topic_id,
    stance: "feud_jab", sim_tick: world.current_tick, like_count: Math.round(sim.follower_count_cache * 0.02), view_count: Math.round(sim.follower_count_cache * 0.3),
  }).select("id").single(), "insert_feud_reply") as { id: string };
  if (existing) {
    check(await db.from("world_events").update({ status: "escalating", severity: 4 }).eq("id", existing.id), "escalate_feud");
    return;
  }
  const ev = await createEvent(db, world, {
    type: "public_feud", category: "conflicts", title: "Public feud",
    description: `@${player.username} and @${sim.username} are trading public shots. Their audiences are starting to pick sides.`,
    severity: 3, involvesPlayer: true, sourceType: "post", sourceId: post.id, accountIds: [sim.id], postIds: [post.id, reply.id], status: "escalating",
    data: { choices: ["apologize", "stand_firm", "ignore"], counterpart: sim.username, admiration_at: player.admiration },
  });
  await notify(db, world.id, player.user_id, { type: "public_controversy", title: `You're in a feud with @${sim.username}`, body: jab, sourceType: "event", sourceId: ev, actorId: sim.id, priority: 3 });
  await evaluateAchievements(db, world, player, { feud: true, sourceEventId: ev });
}
