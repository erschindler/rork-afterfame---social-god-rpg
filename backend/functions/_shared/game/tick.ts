/**
 * Background world simulation. Bounded catch-up, idempotent tick claiming,
 * retry-safe job processing, and a checkpoint per processed tick.
 */
import { check, type Db, log } from "../http.ts";
import { clamp, Rng } from "../sim/rng.ts";
import { LIMITS, TICK_SECONDS } from "../sim/config.ts";
import { chooseIntent, extractHook, generatePost, generateQuote, generateReply, type ReplyStance } from "../sim/text.ts";
import { vocabFor } from "../sim/vocab.ts";
import { decayDeltas, inferCareer } from "../sim/reputation.ts";
import { shouldCreateTrend, stepTrend, type TrendStatus } from "../sim/trends.ts";
import { SIM_COLUMNS, type PlayerRow, type SimRow, type WorldRow } from "./types.ts";
import { applyReputation, createEvent, notify, population, recordEffect, remember, updateRelationship } from "./store.ts";
import { processDistribution } from "./distribute.ts";
import { simReplyBack } from "./actions.ts";
import { evaluateAchievements } from "./achievements.ts";
import { ensureChallenges } from "./challenges.ts";
import { abstractEngagement, voiceOf } from "./util.ts";

export interface SyncResult {
  ticks: number;
  jobs: number;
  skipped: boolean;
}

export async function syncWorld(db: Db, world: WorldRow, opts: { maxTicks?: number } = {}): Promise<SyncResult> {
  const started = Date.now();
  const tickMs = TICK_SECONDS[world.world_pace] * 1000;
  const elapsed = Math.floor((Date.now() - Date.parse(world.last_simulated_at)) / tickMs);
  let ticks = 0;
  if (elapsed >= 1) {
    const n = Math.min(elapsed, opts.maxTicks ?? LIMITS.maxCatchUpTicks);
    // Optimistic claim: only one worker can advance from this tick number.
    const claimed = check(
      await db.from("worlds").update({ current_tick: world.current_tick + n, last_simulated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", world.id).eq("current_tick", world.current_tick).select("id"),
      "claim_tick",
    ) as unknown[];
    if (!claimed.length) return { ticks: 0, jobs: await processDueJobs(db, world), skipped: true };
    for (let i = 1; i <= n; i++) {
      if (Date.now() - started > LIMITS.tickBudgetMs) {
        log("warn", "tick_budget_exhausted", { world: world.id, done: i - 1, planned: n });
        break;
      }
      const tw: WorldRow = { ...world, current_tick: world.current_tick + i };
      const inserted = await db.from("simulation_checkpoints").insert({ world_id: world.id, world_tick: tw.current_tick, checkpoint_data: { started_at: new Date().toISOString() } });
      if (inserted.error) {
        if (inserted.error.code === "23505") continue; // already processed
        check(inserted, "checkpoint");
      }
      const stats = await simulateTick(db, tw);
      check(await db.from("simulation_checkpoints").update({ checkpoint_data: { ...stats, ms: Date.now() - started } }).eq("world_id", world.id).eq("world_tick", tw.current_tick), "checkpoint_update");
      ticks++;
    }
    world = { ...world, current_tick: world.current_tick + n };
    await playerUpkeep(db, world, elapsed);
  }
  const jobs = await processDueJobs(db, world);
  log("info", "world_synced", { world: world.id, ticks, jobs, elapsed, ms: Date.now() - started });
  return { ticks, jobs, skipped: false };
}

export async function processDueJobs(db: Db, world: WorldRow): Promise<number> {
  const jobs = check(await db.rpc("claim_due_jobs", { w: world.id, lim: LIMITS.jobsPerSync }), "claim_jobs") as { id: string; job_type: string; payload: Record<string, unknown>; attempts: number }[];
  let done = 0;
  for (const job of jobs) {
    try {
      if (job.job_type === "distribute_post") await processDistribution(db, world, String(job.payload.post_id), Number(job.payload.stage));
      else if (job.job_type === "sim_reply_back") await simReplyBack(db, world, job.payload as { sim_id: string; player_post_id: string; hostile: boolean; score: number });
      check(await db.from("simulation_jobs").update({ status: "completed", completed_at: new Date().toISOString(), last_error: null }).eq("id", job.id), "complete_job");
      done++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("error", "job_failed", { world: world.id, job: job.id, type: job.job_type, attempts: job.attempts, error: msg });
      await db.from("simulation_jobs").update({ status: job.attempts >= 3 ? "failed" : "pending", last_error: msg.slice(0, 300), scheduled_at: new Date(Date.now() + 60_000 * job.attempts).toISOString() }).eq("id", job.id);
    }
  }
  return done;
}

async function loadPlayers(db: Db, worldId: string): Promise<PlayerRow[]> {
  return check(await db.from("player_world_state").select("*").eq("world_id", worldId), "load_players") as PlayerRow[];
}

/** One step of independent world life. */
export async function simulateTick(db: Db, world: WorldRow): Promise<Record<string, number>> {
  const rng = new Rng(`${world.seed}:tick:${world.current_tick}`);
  const pop = population(world);
  const stats: Record<string, number> = { posts: 0, events: 0, trends: 0 };

  // 1. Independent account activity (lazy: only a relevant slice is loaded)
  const windowSize = Math.min(pop, 220);
  const start = rng.int(0, Math.max(0, pop - windowSize));
  const slice = check(await db.from("simulated_accounts").select(SIM_COLUMNS).eq("world_id", world.id).eq("account_status", "active").gte("seq", start).lt("seq", start + windowSize), "tick_slice") as SimRow[];
  const hour = new Date().getUTCHours();
  const activeCount = clamp(Math.round(pop * 0.035), 3, 14);
  const activeTrends = check(await db.from("trends").select("id, name, topic_id").eq("world_id", world.id).in("status", ["emerging", "rising", "peak"]), "tick_trends") as { id: string; name: string; topic_id: string }[];
  const recentPosts = check(await db.from("posts").select("id, author_simulated_account_id, topic_id, content").eq("world_id", world.id).eq("author_type", "sim").eq("post_type", "post").is("deleted_at", null).order("created_at", { ascending: false }).limit(40), "tick_recent") as { id: string; author_simulated_account_id: string; topic_id: string; content: string }[];

  const chosen = new Set<SimRow>();
  for (let k = 0; k < activeCount * 3 && chosen.size < activeCount && slice.length; k++) {
    chosen.add(rng.weighted(slice, (s) => {
      const d = Math.min(Math.abs(hour - s.activity_profile.peakHour), 24 - Math.abs(hour - s.activity_profile.peakHour));
      return s.activity_profile.postsPerDay * (d <= s.activity_profile.window / 2 ? 1.5 : 0.3);
    }));
  }

  const rows: Record<string, unknown>[] = [];
  const trendLinks: { idx: number; trendId: string }[] = [];
  const replyBumps: string[] = [];
  for (const sim of chosen) {
    const r = rng.fork(sim.id);
    const roll = r.next();
    const target = recentPosts.filter((p) => p.author_simulated_account_id !== sim.id && sim.interests.includes(p.topic_id));
    if (roll < 0.25 && target.length) {
      const p = r.pick(target);
      const stance = r.weighted<ReplyStance>(["praise", "agree_add", "disagree", "joke", "question", "relate", "critique", "dunk"], (s) => {
        const t = sim.personality_traits;
        return ({ praise: t.warmth, agree_add: t.rigor, disagree: t.contrarian, joke: t.humor, question: t.sociability, relate: t.warmth * 0.5, critique: t.rigor * t.contrarian, dunk: t.aggression * 0.6 } as Record<string, number>)[s];
      });
      rows.push({ world_id: world.id, author_type: "sim", author_simulated_account_id: sim.id, post_type: "reply", parent_post_id: p.id, root_post_id: p.id, content: generateReply(stance, { topic: p.topic_id, hook: extractHook(p.content) }, voiceOf(sim), r), topic_id: p.topic_id, stance, sim_tick: world.current_tick, like_count: r.int(0, 15) });
      replyBumps.push(p.id);
    } else if (roll < 0.33 && target.length && sim.personality_traits.contrarian > 0.5) {
      const p = r.pick(target);
      const stance: ReplyStance = sim.personality_traits.aggression > 0.55 ? "dunk" : r.pick(["critique", "disagree", "agree_add"] as ReplyStance[]);
      const eng = abstractEngagement(sim.follower_count_cache, 0.5, () => r.next());
      rows.push({ world_id: world.id, author_type: "sim", author_simulated_account_id: sim.id, post_type: "quote", quoted_post_id: p.id, content: generateQuote(stance, { topic: p.topic_id, hook: extractHook(p.content) }, voiceOf(sim), r), topic_id: p.topic_id, stance, sim_tick: world.current_tick, like_count: eng.likes, view_count: eng.views, repost_count: eng.reposts });
    } else {
      const trends = activeTrends.filter((t) => sim.interests.includes(t.topic_id) || r.chance(0.08));
      const intent = chooseIntent(sim.archetype, sim.personality_traits, r, trends.length > 0);
      const trend = intent === "trend" && trends.length ? r.pick(trends) : null;
      const topic = trend?.topic_id ?? r.pick(sim.interests);
      const eng = abstractEngagement(sim.follower_count_cache, 0.4 + r.next() * 0.4, () => r.next());
      if (trend) trendLinks.push({ idx: rows.length, trendId: trend.id });
      rows.push({ world_id: world.id, author_type: "sim", author_simulated_account_id: sim.id, post_type: "post", content: generatePost(intent, { topic, tag: trend?.name }, voiceOf(sim), r), topic_id: topic, stance: intent, sim_tick: world.current_tick, like_count: eng.likes, reply_count: 0, repost_count: eng.reposts, view_count: eng.views });
    }
  }
  if (rows.length) {
    const inserted = check(await db.from("posts").insert(rows, { defaultToNull: false }).select("id"), "tick_posts") as { id: string }[];
    stats.posts = inserted.length;
    if (trendLinks.length) check(await db.from("trend_posts").insert(trendLinks.map((l) => ({ world_id: world.id, trend_id: l.trendId, post_id: inserted[l.idx].id }))), "tick_trend_links");
    for (const id of replyBumps) await db.rpc("adjust_post_counts", { p: id, d_like: 0, d_reply: 1, d_repost: 0, d_quote: 0, d_view: 0 });
  }

  // 2. The world reacts to players who have earned attention
  for (const player of await loadPlayers(db, world.id)) {
    await playerDirectedActivity(db, world, player, rng.fork(`p${player.id}`));
  }

  // 3. Independent emergent events
  stats.events = await independentEvents(db, world, rng.fork("events"));

  // 4. Trends lifecycle + new trend detection
  stats.trends = await updateTrends(db, world, rng.fork("trends"));
  return stats;
}

async function playerDirectedActivity(db: Db, world: WorldRow, player: PlayerRow, rng: Rng): Promise<void> {
  if (player.post_count === 0) return;
  // Recognition depends on fame, interests, and prior exposure.
  if (rng.chance(clamp((player.fame - 10) / 140, 0, 0.45))) {
    const top = check(await db.from("posts").select("id, content, topic_id").eq("author_player_id", player.id).is("deleted_at", null).order("like_count", { ascending: false }).limit(1), "top_post") as { id: string; content: string; topic_id: string }[];
    const exposed = check(await db.from("post_interactions").select("actor_simulated_account_id").eq("post_id", top[0]?.id ?? "00000000-0000-0000-0000-000000000000").eq("interaction_type", "seen").limit(80), "exposed") as { actor_simulated_account_id: string }[];
    if (top.length && exposed.length) {
      const simId = rng.pick(exposed).actor_simulated_account_id;
      const sim = check(await db.from("simulated_accounts").select(SIM_COLUMNS).eq("id", simId).single(), "recognizer") as SimRow;
      const text = generatePost("recognize_player", { topic: top[0].topic_id, mention: `@${player.username}`, hook: extractHook(top[0].content) }, voiceOf(sim), rng);
      check(await db.from("posts").insert({ world_id: world.id, author_type: "sim", author_simulated_account_id: sim.id, post_type: "post", content: text, topic_id: top[0].topic_id, stance: "recognize_player", sim_tick: world.current_tick, like_count: Math.round(sim.follower_count_cache * 0.01) }), "recognition_post");
      await notify(db, world.id, player.user_id, { type: "mention", title: `@${sim.username} mentioned you`, body: text, actorId: sim.id, sourceType: "sim", sourceId: sim.id, priority: 2 });
      await remember(db, world.id, sim.id, { entityType: "player", entityId: player.id, type: "recognition", summary: `Recognized @${player.username} from their post about ${extractHook(top[0].content)}`, importance: 0.4, sentiment: 0.3 });
      await applyReputation(db, world, player, [{ attribute: "fame", delta: 0.3 + sim.fame / 100, reason: `Recognized in conversation by @${sim.username}` }], { skipSnapshot: true });
    }
  }
  // Rivals keep the feud alive.
  const rivals = check(await db.from("relationships").select("account_a_id, relationship_score, last_interaction_at").eq("world_id", world.id).eq("account_b_id", player.id).in("relationship_status", ["rival", "public_enemy"]).limit(10), "rivals") as { account_a_id: string; relationship_score: number }[];
  for (const rv of rivals) {
    if (!rng.chance(0.12)) continue;
    const sim = check(await db.from("simulated_accounts").select(SIM_COLUMNS).eq("id", rv.account_a_id).single(), "rival_sim") as SimRow;
    const text = generatePost("feud_jab", { topic: sim.interests[0], mention: `@${player.username}` }, voiceOf(sim), rng);
    check(await db.from("posts").insert({ world_id: world.id, author_type: "sim", author_simulated_account_id: sim.id, post_type: "post", content: text, topic_id: sim.interests[0], stance: "feud_jab", sim_tick: world.current_tick, like_count: Math.round(sim.follower_count_cache * 0.02) }), "rival_post");
    await notify(db, world.id, player.user_id, { type: "mention", title: `@${sim.username} took another shot at you`, body: text, actorId: sim.id, priority: 2 });
    await applyReputation(db, world, player, [{ attribute: "controversy", delta: 1, reason: `Ongoing feud with @${sim.username}` }, { attribute: "fame", delta: 0.3, reason: "Feud kept your name in circulation" }], { skipSnapshot: true });
  }
  // Collaboration invitations come from allies with ambition.
  const allies = check(await db.from("relationships").select("account_a_id, relationship_score").eq("world_id", world.id).eq("account_b_id", player.id).gte("relationship_score", 28).neq("relationship_status", "collaborator").limit(10), "allies") as { account_a_id: string }[];
  if (allies.length && rng.chance(0.18)) {
    const sim = check(await db.from("simulated_accounts").select(SIM_COLUMNS).eq("id", rng.pick(allies).account_a_id).single(), "ally_sim") as SimRow;
    const creatorish = ["small_creator", "established_creator", "artist", "entrepreneur", "community_leader", "memer", "journalist"].includes(sim.archetype);
    if (creatorish && sim.personality_traits.ambition > 0.45) {
      const pending = check(await db.from("notifications").select("id").eq("recipient_user_id", player.user_id).eq("world_id", world.id).eq("notification_type", "collaboration_invite").contains("actor_ids", [sim.id]).limit(1), "pending_collab") as unknown[];
      if (!pending.length) {
        await notify(db, world.id, player.user_id, { type: "collaboration_invite", title: `@${sim.username} wants to collaborate`, body: `${sim.display_name} (${sim.follower_count_cache.toLocaleString()} followers) suggested a joint ${vocabFor(sim.interests[0]).name} project.`, actorId: sim.id, sourceType: "sim", sourceId: sim.id, priority: 3, actionState: "pending" });
      }
    }
  }
}

async function loadSim(db: Db, id: string): Promise<SimRow> {
  return check(await db.from("simulated_accounts").select(SIM_COLUMNS).eq("id", id).single(), "event_sim") as SimRow;
}

async function independentEvents(db: Db, world: WorldRow, rng: Rng): Promise<number> {
  // Close out stale events.
  const stale = check(await db.from("world_events").select("id, event_type").eq("world_id", world.id).in("status", ["active", "escalating"]).lt("sim_tick", world.current_tick - 16), "stale_events") as { id: string; event_type: string }[];
  for (const e of stale) check(await db.from("world_events").update({ status: e.event_type === "public_feud" ? "faded" : "resolved", ended_at: new Date().toISOString() }).eq("id", e.id), "close_event");

  if (!rng.chance(0.3)) return 0;
  const pop = population(world);
  const sample = check(await db.from("simulated_accounts").select(SIM_COLUMNS).eq("world_id", world.id).eq("account_status", "active").gte("seq", rng.int(0, Math.max(0, pop - 150))).limit(150), "event_sample") as SimRow[];
  if (sample.length < 4) return 0;
  const kind = rng.weighted(["feud", "reconcile", "breakout", "scandal", "collab", "decline", "platform", "community"], (k) => ({ feud: 3, reconcile: 2, breakout: 2.5, scandal: 1.2, collab: 2, decline: 1, platform: 1.2, community: 1.5 } as Record<string, number>)[k]);
  const now = world.current_tick;

  if (kind === "feud") {
    const fighters = sample.filter((s) => s.personality_traits.conflict_tolerance > 0.5);
    if (fighters.length < 2) return 0;
    const a = rng.pick(fighters);
    const b = rng.pick(fighters.filter((s) => s.id !== a.id && s.interests.some((i) => a.interests.includes(i))).concat(fighters.filter((s) => s.id !== a.id)).slice(0, 8));
    const topic = a.interests.find((i) => b.interests.includes(i)) ?? a.interests[0];
    const posts = check(await db.from("posts").insert([
      { world_id: world.id, author_type: "sim", author_simulated_account_id: a.id, post_type: "post", content: generatePost("feud_jab", { topic, mention: `@${b.username}` }, voiceOf(a), rng), topic_id: topic, stance: "feud_jab", sim_tick: now, like_count: Math.round(a.follower_count_cache * 0.02) },
      { world_id: world.id, author_type: "sim", author_simulated_account_id: b.id, post_type: "post", content: generatePost("feud_jab", { topic, mention: `@${a.username}` }, voiceOf(b), rng), topic_id: topic, stance: "feud_jab", sim_tick: now, like_count: Math.round(b.follower_count_cache * 0.02) },
    ], { defaultToNull: false }).select("id"), "feud_posts") as { id: string }[];
    const ev = await createEvent(db, world, { type: "public_feud", category: "conflicts", title: "Public feud", description: `@${a.username} and @${b.username} traded quote-posts over ${vocabFor(topic).name}. Their communities started picking sides.`, severity: 3, accountIds: [a.id, b.id], postIds: posts.map((p) => p.id), status: "escalating", data: { topic } });
    await updateRelationship(db, world.id, { aType: "sim", aId: a.id, bType: "sim", bId: b.id, kind: "dunk", reason: "public feud", eventId: ev, hostile: true, multiplier: 3 });
    await updateRelationship(db, world.id, { aType: "sim", aId: b.id, bType: "sim", bId: a.id, kind: "dunk", reason: "public feud", eventId: ev, hostile: true, multiplier: 3 });
    for (const s of [a, b]) {
      const next = clamp(s.controversy + 6, 0, 100);
      check(await db.from("simulated_accounts").update({ controversy: next, fame: clamp(s.fame + 1, 0, 100) }).eq("id", s.id), "feud_effect");
      await recordEffect(db, world.id, ev, "sim", s.id, "controversy", s.controversy, next);
    }
  } else if (kind === "reconcile") {
    const feud = check(await db.from("world_events").select("id, related_account_ids").eq("world_id", world.id).eq("event_type", "public_feud").eq("involves_player", false).in("status", ["active", "escalating", "faded"]).lt("sim_tick", now - 4).limit(1), "feud_to_reconcile") as { id: string; related_account_ids: string[] }[];
    if (!feud.length || feud[0].related_account_ids.length < 2) return 0;
    const [a, b] = await Promise.all(feud[0].related_account_ids.slice(0, 2).map((id) => loadSim(db, id)));
    if (a.personality_traits.openness + b.personality_traits.openness < 0.8 && rng.chance(0.6)) return 0;
    check(await db.from("posts").insert({ world_id: world.id, author_type: "sim", author_simulated_account_id: a.id, post_type: "post", content: generatePost("reconciliation", { topic: a.interests[0], mention: `@${b.username}` }, voiceOf(a), rng), topic_id: a.interests[0], stance: "reconciliation", sim_tick: now, like_count: Math.round(a.follower_count_cache * 0.03) }), "reconcile_post");
    check(await db.from("world_events").update({ status: "resolved", ended_at: new Date().toISOString() }).eq("id", feud[0].id), "resolve_feud");
    const ev = await createEvent(db, world, { type: "surprise_reconciliation", category: "community", title: "Surprise reconciliation", description: `@${a.username} and @${b.username} buried the hatchet after their public feud.`, severity: 2, accountIds: [a.id, b.id], status: "resolved", data: { previous_event: feud[0].id } });
    await updateRelationship(db, world.id, { aType: "sim", aId: a.id, bType: "sim", bId: b.id, kind: "apology", reason: "reconciled", eventId: ev, multiplier: 3 });
    await updateRelationship(db, world.id, { aType: "sim", aId: b.id, bType: "sim", bId: a.id, kind: "apology", reason: "reconciled", eventId: ev, multiplier: 3 });
  } else if (kind === "breakout") {
    const s = rng.pick(sample.filter((x) => x.fame < 40));
    if (!s) return 0;
    const nextFame = clamp(s.fame + rng.range(4, 10), 0, 100);
    const nextFollowers = Math.round(s.follower_count_cache * rng.range(1.3, 2.2));
    check(await db.from("simulated_accounts").update({ fame: nextFame, follower_count_cache: nextFollowers }).eq("id", s.id), "breakout");
    const ev = await createEvent(db, world, { type: "breakout_creator", category: "creator", title: "Breakout creator", description: `@${s.username} passed ${nextFollowers.toLocaleString()} followers after a run of ${vocabFor(s.interests[0]).name} posts landed.`, severity: 2, accountIds: [s.id] });
    await recordEffect(db, world.id, ev, "sim", s.id, "fame", s.fame, nextFame);
  } else if (kind === "scandal") {
    const s = rng.weighted(sample, (x) => x.infamy + x.personality_traits.risk_tolerance * 20 + x.fame / 4);
    const nextCred = clamp(s.credibility - rng.range(8, 18), 0, 100);
    const nextInf = clamp(s.infamy + rng.range(8, 15), 0, 100);
    check(await db.from("simulated_accounts").update({ credibility: nextCred, infamy: nextInf, fame: clamp(s.fame + 2, 0, 100) }).eq("id", s.id), "scandal");
    const what = rng.pick(["was caught exaggerating sponsorship numbers", "posted a screenshot that turned out to be edited", "got called out for recycling someone else's work", "deleted a thread after people found the receipts"]);
    const ev = await createEvent(db, world, { type: "creator_scandal", category: "reputation", title: "Creator scandal", description: `@${s.username} ${what}. Their credibility took a hit.`, severity: 3, accountIds: [s.id], status: "escalating" });
    await recordEffect(db, world.id, ev, "sim", s.id, "credibility", s.credibility, nextCred);
    await recordEffect(db, world.id, ev, "sim", s.id, "infamy", s.infamy, nextInf);
  } else if (kind === "collab") {
    const creators = sample.filter((x) => x.personality_traits.ambition > 0.55);
    if (creators.length < 2) return 0;
    const a = rng.pick(creators);
    const b = rng.pick(creators.filter((x) => x.id !== a.id));
    check(await db.from("posts").insert({ world_id: world.id, author_type: "sim", author_simulated_account_id: a.id, post_type: "post", content: generatePost("collab_announce", { topic: a.interests[0], mention: `@${b.username}` }, voiceOf(a), rng), topic_id: a.interests[0], stance: "collab_announce", sim_tick: now, like_count: Math.round(a.follower_count_cache * 0.03) }), "collab_post");
    const ev = await createEvent(db, world, { type: "creator_collaboration", category: "creator", title: "Creator collaboration", description: `@${a.username} and @${b.username} announced a joint project. Both audiences are cross-pollinating.`, severity: 1, accountIds: [a.id, b.id], status: "resolved" });
    await updateRelationship(db, world.id, { aType: "sim", aId: a.id, bType: "sim", bId: b.id, kind: "collab", reason: "collaborated", eventId: ev });
  } else if (kind === "decline") {
    const s = rng.pick(sample.filter((x) => x.fame > 35));
    if (!s) return 0;
    const nextFame = clamp(s.fame - rng.range(4, 9), 0, 100);
    check(await db.from("simulated_accounts").update({ fame: nextFame, follower_count_cache: Math.round(s.follower_count_cache * 0.85) }).eq("id", s.id), "decline");
    const ev = await createEvent(db, world, { type: "sudden_decline", category: "creator", title: "Losing steam", description: `@${s.username}'s engagement has dropped sharply. Some followers say the content got repetitive.`, severity: 1, accountIds: [s.id] });
    await recordEffect(db, world.id, ev, "sim", s.id, "fame", s.fame, nextFame);
  } else if (kind === "platform") {
    const topic = rng.pick(sample).interests[0];
    const news = rng.pick(vocabFor(topic).news);
    const reporter = sample.find((s) => s.archetype === "journalist") ?? rng.pick(sample);
    check(await db.from("posts").insert({ world_id: world.id, author_type: "sim", author_simulated_account_id: reporter.id, post_type: "post", content: generatePost("news_reaction", { topic }, voiceOf(reporter), rng), topic_id: topic, stance: "news_reaction", sim_tick: now, like_count: Math.round(reporter.follower_count_cache * 0.03) }), "news_post");
    await createEvent(db, world, { type: "platform_conversation", category: "platform", title: "Platform-wide conversation", description: `Everyone is talking about how ${news}.`, severity: 2, accountIds: [reporter.id], data: { topic } });
  } else {
    const c = check(await db.from("communities").select("id, name, member_count, activity_score").eq("world_id", world.id), "communities_for_event") as { id: string; name: string; member_count: number; activity_score: number }[];
    if (!c.length) return 0;
    const pick = rng.pick(c);
    const nextAct = pick.activity_score + 10;
    check(await db.from("communities").update({ activity_score: nextAct }).eq("id", pick.id), "community_bump");
    const ev = await createEvent(db, world, { type: "community_milestone", category: "community", title: "Community milestone", description: `${pick.name} had its most active day yet as newcomers poured in.`, severity: 1, sourceType: "community", sourceId: pick.id });
    await recordEffect(db, world.id, ev, "community", pick.id, "activity_score", pick.activity_score, nextAct);
  }
  return 1;
}

async function updateTrends(db: Db, world: WorldRow, rng: Rng): Promise<number> {
  const tickMs = TICK_SECONDS[world.world_pace] * 1000;
  const since = new Date(Date.now() - tickMs * 1.5).toISOString();
  const trends = check(await db.from("trends").select("*").eq("world_id", world.id).neq("status", "ended"), "load_trends") as { id: string; name: string; activity_score: number; growth_rate: number; decay_rate: number; status: TrendStatus; started_at: string; peaked_at: string | null; post_count: number }[];
  for (const t of trends) {
    const recent = await db.from("trend_posts").select("id", { count: "exact", head: true }).eq("trend_id", t.id).gte("created_at", since);
    const age = Math.floor((Date.now() - Date.parse(t.started_at)) / tickMs);
    const next = stepTrend(t, recent.count ?? 0, age);
    const patch: Record<string, unknown> = { activity_score: next.activity_score, growth_rate: next.growth_rate, status: next.status };
    if (next.status === "peak" && !t.peaked_at) patch.peaked_at = new Date().toISOString();
    if (next.status === "ended") patch.ended_at = new Date().toISOString();
    check(await db.from("trends").update(patch).eq("id", t.id), "update_trend");
  }

  // Detect emerging hashtags from recent posts.
  const windowStart = new Date(Date.now() - tickMs * 4).toISOString();
  const tagged = check(await db.from("posts").select("id, content, created_at, author_type, author_player_id, author_simulated_account_id, topic_id").eq("world_id", world.id).is("deleted_at", null).gte("created_at", windowStart).like("content", "%#%").order("created_at").limit(300), "tagged_posts") as { id: string; content: string; author_type: string; author_player_id: string | null; author_simulated_account_id: string | null; topic_id: string }[];
  const existing = new Set((check(await db.from("trends").select("slug").eq("world_id", world.id), "trend_slugs") as { slug: string }[]).map((t) => t.slug));
  const groups = new Map<string, typeof tagged>();
  for (const p of tagged) {
    for (const m of p.content.match(/#([A-Za-z][A-Za-z0-9_]{1,30})/g) ?? []) {
      const slug = m.slice(1).toLowerCase();
      if (existing.has(slug)) continue;
      groups.set(slug, [...(groups.get(slug) ?? []), p]);
    }
  }
  let created = 0;
  for (const [slug, posts] of groups) {
    const authors = new Set(posts.map((p) => p.author_player_id ?? p.author_simulated_account_id)).size;
    if (!shouldCreateTrend(authors, posts.length, population(world))) continue;
    const origin = posts[0];
    const name = origin.content.match(new RegExp(`#${slug}`, "i"))?.[0] ?? `#${slug}`;
    const ins = await db.from("trends").insert({
      world_id: world.id, name, slug, topic_id: origin.topic_id, category: origin.topic_id, description: `A new conversation is catching on around ${name}.`,
      activity_score: posts.length * 6, growth_rate: 1, post_count: posts.length, participant_count: authors, status: "emerging",
      origin_type: origin.author_type, origin_id: origin.author_player_id ?? origin.author_simulated_account_id,
    }).select("id").single();
    if (ins.error) continue;
    const trendId = (ins.data as { id: string }).id;
    await db.from("trend_posts").insert(posts.map((p) => ({ world_id: world.id, trend_id: trendId, post_id: p.id })));
    created++;
    const ev = await createEvent(db, world, {
      type: "trend_explosion", category: "trends", title: "Trend explosion",
      description: `${name} started trending across ${authors} accounts${origin.author_type === "player" ? ", sparked by a player post" : ""}.`,
      severity: 2, involvesPlayer: origin.author_type === "player", sourceType: "trend", sourceId: trendId, postIds: posts.slice(0, 5).map((p) => p.id),
    });
    if (origin.author_type === "player" && origin.author_player_id) {
      const player = check(await db.from("player_world_state").select("*").eq("id", origin.author_player_id).single(), "trend_origin_player") as PlayerRow;
      await notify(db, world.id, player.user_id, { type: "trend_participation", title: `You started ${name}`, body: `${authors} accounts are now using your hashtag.`, sourceType: "trend", sourceId: trendId, priority: 3 });
      const fresh = await applyReputation(db, world, player, [{ attribute: "fame", delta: 2.5, reason: `Started the ${name} trend` }, { attribute: "influence", delta: 1.5, reason: "Shaped a platform conversation" }], { eventId: ev, snapshotLabel: `Started ${name}` });
      await evaluateAchievements(db, world, fresh, { trendStarted: true, sourceEventId: ev });
    }
  }
  void rng;
  return created;
}

/** Decay/recovery proportional to elapsed time, career inference, challenges, achievements. */
async function playerUpkeep(db: Db, world: WorldRow, elapsedTicks: number): Promise<void> {
  const tickHours = TICK_SECONDS[world.world_pace] / 3600;
  for (const player of await loadPlayers(db, world.id)) {
    const hoursSince = player.last_action_at ? (Date.now() - Date.parse(player.last_action_at)) / 3_600_000 : 999;
    const lastLoss = check(await db.from("reputation_history").select("created_at").eq("player_id", player.id).eq("attribute_name", "credibility").lt("delta", 0).order("created_at", { ascending: false }).limit(1), "last_cred_loss") as { created_at: string }[];
    const recentLoss = lastLoss.length > 0 && Date.now() - Date.parse(lastLoss[0].created_at) < 6 * 3_600_000;
    const ticks = Math.min(elapsedTicks, Math.round(72 / tickHours));
    const deltas = decayDeltas(player, ticks, { hoursSinceLastPost: hoursSince, recentCredibilityLoss: recentLoss });
    let fresh = player;
    if (deltas.length) fresh = await applyReputation(db, world, player, deltas, { skipSnapshot: world.current_tick % 4 !== 0 });

    const posts = check(await db.from("posts").select("signals, post_type, topic_id").eq("author_player_id", player.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(60), "career_posts") as { signals: Record<string, number | boolean>; post_type: string; topic_id: string }[];
    const own = posts.filter((p) => p.post_type !== "reply");
    const trendsStarted = await db.from("trends").select("id", { count: "exact", head: true }).eq("origin_id", player.id);
    const career = inferCareer({
      posts: own.length, humorPosts: own.filter((p) => Number(p.signals.humor) > 0.3).length, evidencePosts: own.filter((p) => Number(p.signals.evidence) > 0.4).length,
      controversialPosts: own.filter((p) => Number(p.signals.controversy) > 0.4).length, questionPosts: own.filter((p) => p.signals.question === true).length,
      replies: posts.length - own.length, trendsStarted: trendsStarted.count ?? 0, positivePosts: own.filter((p) => Number(p.signals.positivity) > 0.3).length,
      topicsUsed: new Set(posts.map((p) => p.topic_id)).size, nicheAuthority: fresh.niche_authority, fame: fresh.fame, infamy: fresh.infamy,
    });
    if (career.join(",") !== (fresh.career_identity ?? []).join(",")) {
      check(await db.from("player_world_state").update({ career_identity: career }).eq("id", player.id), "update_career");
      if (career.length && career[0] !== fresh.career_identity?.[0]) {
        await notify(db, world.id, player.user_id, { type: "fame_milestone", title: `People see you as: ${career.join(" · ")}`, body: "Your identity is emerging from how you post. It can change any time.", priority: 1 });
      }
    }
    await ensureChallenges(db, fresh);
    await evaluateAchievements(db, world, fresh, {});
  }
}
