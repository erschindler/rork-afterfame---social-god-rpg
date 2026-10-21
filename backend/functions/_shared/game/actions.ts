/** Player social actions. Every one is validated and resolved server-side. */
import { check, type Db, HttpError } from "../http.ts";
import { clamp, Rng } from "../sim/rng.ts";
import { LIMITS, TICK_SECONDS } from "../sim/config.ts";
import { analyzePost } from "../sim/analyze.ts";
import { generatePost, generateReply, extractHook } from "../sim/text.ts";
import type { AttrDelta } from "../sim/reputation.ts";
import { SIM_COLUMNS, type PlayerRow, type PostRow, type SimRow, type WorldRow } from "./types.ts";
import { applyReputation, createEvent, notify, recordEffect, refreshPlayerCounts, remember, updateRelationship } from "./store.ts";
import { scheduleJob, startPlayerFeud } from "./distribute.ts";
import { evaluateAchievements } from "./achievements.ts";
import { progressChallenge } from "./challenges.ts";
import { voiceOf } from "./util.ts";

async function enforceRateLimit(db: Db, player: PlayerRow): Promise<void> {
  const tenMin = new Date(Date.now() - 10 * 60_000).toISOString();
  const day = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await db.from("posts").select("id", { count: "exact", head: true }).eq("author_player_id", player.id).gte("created_at", tenMin);
  if ((recent.count ?? 0) >= LIMITS.postsPer10Min) throw new HttpError(429, "You're posting very fast. Give your audience a few minutes.", "rate_limited");
  const daily = await db.from("posts").select("id", { count: "exact", head: true }).eq("author_player_id", player.id).gte("created_at", day);
  if ((daily.count ?? 0) >= LIMITS.postsPerDay) throw new HttpError(429, "Daily posting limit reached. The world will still be here tomorrow.", "rate_limited");
}

async function loadSim(db: Db, worldId: string, simId: string): Promise<SimRow | null> {
  return check(await db.from("simulated_accounts").select(SIM_COLUMNS).eq("world_id", worldId).eq("id", simId).maybeSingle(), "load_sim") as SimRow | null;
}

async function loadPost(db: Db, worldId: string, postId: string): Promise<PostRow> {
  const p = check(await db.from("posts").select("*").eq("world_id", worldId).eq("id", postId).maybeSingle(), "load_target_post") as PostRow | null;
  if (!p || p.deleted_at) throw new HttpError(404, "That post is no longer available.", "not_found");
  return p;
}

export interface CreatePostInput {
  kind: "post" | "reply" | "quote";
  content: string;
  topic?: string | null;
  parentId?: string | null;
  quotedId?: string | null;
}

/**
 * Persist a player post and queue its first distribution stage. Reactions arrive
 * asynchronously (background task + sync polling), like on a real network.
 */
export async function createPlayerPost(db: Db, world: WorldRow, player: PlayerRow, input: CreatePostInput): Promise<{ post: PostRow }> {
  const content = input.content.replace(/\s+$/g, "").replace(/^\s+/g, "");
  if (content.length < 1) throw new HttpError(400, "Write something first.", "invalid_input");
  if (content.length > LIMITS.maxPostLength) throw new HttpError(400, `Posts are limited to ${LIMITS.maxPostLength} characters.`, "invalid_input");
  await enforceRateLimit(db, player);

  let parent: PostRow | null = null;
  let quoted: PostRow | null = null;
  if (input.kind === "reply") parent = await loadPost(db, world.id, input.parentId ?? "");
  if (input.kind === "quote") quoted = await loadPost(db, world.id, input.quotedId ?? "");

  const recent = check(await db.from("posts").select("content, topic_id, created_at").eq("author_player_id", player.id).order("created_at", { ascending: false }).limit(12), "load_recent_own") as { content: string; topic_id: string; created_at: string }[];
  const signals = analyzePost(content, { topic: input.topic ?? parent?.topic_id ?? quoted?.topic_id ?? null, fallbackTopic: player.interests[0] ?? "everyday", recentOwnPosts: recent.map((r) => r.content) });

  const post = check(await db.from("posts").insert({
    world_id: world.id, author_type: "player", author_player_id: player.id, post_type: input.kind, content, topic_id: signals.topic,
    parent_post_id: parent?.id ?? null, root_post_id: parent ? (parent.root_post_id ?? parent.id) : null, quoted_post_id: quoted?.id ?? null,
    signals, sim_tick: world.current_tick,
  }).select("*").single(), "insert_player_post") as PostRow;

  // Posting fatigue: frequent and repetitive posting reduces efficiency.
  const threeHours = Date.now() - 3 * 3_600_000;
  const recentCount = recent.filter((r) => Date.parse(r.created_at) > threeHours).length;
  const fatigueDelta = clamp(Math.max(0, recentCount - 2) * 0.04 + (1 - signals.novelty) * 0.08, 0, 0.25);
  const deltas: AttrDelta[] = [];
  if (fatigueDelta > 0.01) deltas.push({ attribute: "fatigue", delta: fatigueDelta, reason: "Frequent posting" });
  if (signals.correction && player.credibility < 60) deltas.push({ attribute: "credibility", delta: 1.5, reason: "Published a public correction" });
  check(await db.from("player_world_state").update({ last_action_at: new Date().toISOString() }).eq("id", player.id), "touch_player");
  await refreshPlayerCounts(db, player.id);
  let fresh = check(await db.from("player_world_state").select("*").eq("id", player.id).single(), "reload_player") as PlayerRow;
  if (deltas.length) fresh = await applyReputation(db, world, fresh, deltas, { postId: post.id, skipSnapshot: true });

  // Direct effects on the account you replied to / quoted
  const target = parent ?? quoted;
  if (target?.author_type === "sim" && target.author_simulated_account_id) {
    if (parent) check(await db.rpc("adjust_post_counts", { p: parent.id, d_like: 0, d_reply: 1, d_repost: 0, d_quote: 0, d_view: 0 }), "inc_reply");
    if (quoted) check(await db.rpc("adjust_post_counts", { p: quoted.id, d_like: 0, d_reply: 0, d_repost: 0, d_quote: 1, d_view: 0 }), "inc_quote");
    await reactToPlayerResponse(db, world, fresh, post, target, signals.aggression > 0.3, content.length >= 60 && signals.aggression < 0.2);
  } else if (target) {
    check(await db.rpc("adjust_post_counts", { p: target.id, d_like: 0, d_reply: parent ? 1 : 0, d_repost: 0, d_quote: quoted ? 1 : 0, d_view: 0 }), "inc_counts_player_target");
  }

  // Challenges
  if (input.kind === "reply" && content.length >= 60 && signals.aggression < 0.2) await progressChallenge(db, fresh, "thoughtful_replies", 1);
  const topicCounts = new Map<string, number>();
  recent.forEach((r) => topicCounts.set(r.topic_id, (topicCounts.get(r.topic_id) ?? 0) + 1));
  if (recent.length >= 2 && (topicCounts.get(signals.topic) ?? 0) <= 1) await progressChallenge(db, fresh, "new_topic", 1);
  const membership = check(await db.from("community_memberships").select("id, standing, communities!inner(topic_id)").eq("player_id", player.id), "load_player_comms") as unknown as { id: string; standing: number; communities: { topic_id: string } }[];
  const inCommunity = membership.find((m) => m.communities?.topic_id === signals.topic);
  if (inCommunity) {
    await progressChallenge(db, fresh, "community_post", 1);
    check(await db.from("community_memberships").update({ standing: Math.min(100, inCommunity.standing + 1 + signals.quality * 2) }).eq("id", inCommunity.id), "community_standing");
  }
  if (signals.hashtags.length) {
    const trends = check(await db.from("trends").select("id, name, activity_score, post_count").eq("world_id", world.id).in("status", ["emerging", "rising", "peak"]), "load_active_trends") as { id: string; name: string; activity_score: number; post_count: number }[];
    for (const t of trends) {
      if (signals.hashtags.some((h) => h.toLowerCase() === t.name.toLowerCase())) {
        await db.from("trend_posts").insert({ world_id: world.id, trend_id: t.id, post_id: post.id });
        check(await db.from("trends").update({ post_count: t.post_count + 1, activity_score: t.activity_score + 4 }).eq("id", t.id), "trend_bump");
        await progressChallenge(db, fresh, "join_trend", 1);
        await notify(db, world.id, fresh.user_id, { type: "trend_participation", title: `You joined ${t.name}`, body: "Your post is now part of the trend.", sourceType: "trend", sourceId: t.id });
      }
    }
  }

  // Stage 1 is queued as a job; the caller kicks it off in the background.
  await scheduleJob(db, world.id, "distribute_post", { post_id: post.id, stage: 1 }, new Date(), `dist:${post.id}:1`);
  await evaluateAchievements(db, world, fresh, { sourcePostId: post.id });
  return { post };
}

/** A sim responds to the player replying to / quoting them, possibly replying back later. */
async function reactToPlayerResponse(db: Db, world: WorldRow, player: PlayerRow, playerPost: PostRow, target: PostRow, hostile: boolean, thoughtful: boolean): Promise<void> {
  const sim = await loadSim(db, world.id, target.author_simulated_account_id!);
  if (!sim) return;
  const kind = hostile ? "player_reply_hostile" : thoughtful ? "player_reply_thoughtful" : "joke";
  const rel = await updateRelationship(db, world.id, { aType: "sim", aId: sim.id, bType: "player", bId: player.id, kind, reason: hostile ? "you replied with hostility" : thoughtful ? "you engaged thoughtfully with their post" : "you replied to them", postId: playerPost.id, hostile });
  if (hostile || thoughtful) {
    await remember(db, world.id, sim.id, { entityType: "player", entityId: player.id, type: hostile ? "public_dispute" : "positive_interaction", summary: `@${player.username} ${hostile ? "came at me in the replies" : "had a thoughtful take on my post"}`, importance: hostile ? 0.7 : 0.4, sentiment: hostile ? -0.7 : 0.5, postId: playerPost.id });
  }
  // Reply-back probability depends on sociability, relationship, and the player's fame (big accounts reply less to strangers).
  const rng = new Rng(`${world.seed}:replyback:${playerPost.id}`);
  const t = sim.personality_traits;
  const pBack = clamp(0.12 + t.sociability * 0.35 + Math.abs(rel.score) / 200 + (hostile ? t.conflict_tolerance * 0.3 : 0) - sim.fame / 250 + player.fame / 300, 0.05, 0.85);
  if (rng.chance(pBack)) {
    const delay = TICK_SECONDS[world.world_pace] * rng.range(0.1, 0.5) * 1000;
    await scheduleJob(db, world.id, "sim_reply_back", { sim_id: sim.id, player_post_id: playerPost.id, hostile, score: rel.score }, new Date(Date.now() + delay), `replyback:${playerPost.id}`);
  }
  if (hostile && rel.score <= -15) {
    await startPlayerFeud(db, world, player, sim, playerPost, rng);
  }
  if (!hostile && rel.score >= 25 && rel.prevStatus !== rel.status) {
    await notify(db, world.id, player.user_id, { type: "relationship_change", title: `@${sim.username} is warming up to you`, body: `Your relationship is now: ${rel.status.replace("_", " ")}.`, actorId: sim.id, sourceType: "sim", sourceId: sim.id });
  }
}

export async function simReplyBack(db: Db, world: WorldRow, payload: { sim_id: string; player_post_id: string; hostile: boolean; score: number }): Promise<void> {
  const sim = await loadSim(db, world.id, payload.sim_id);
  const post = check(await db.from("posts").select("*").eq("id", payload.player_post_id).maybeSingle(), "load_reply_target") as PostRow | null;
  if (!sim || !post || post.deleted_at) return;
  const player = check(await db.from("player_world_state").select("*").eq("id", post.author_player_id).single(), "load_rb_player") as PlayerRow;
  const rng = new Rng(`${world.seed}:rbtext:${post.id}`);
  const stance = payload.hostile ? (sim.personality_traits.warmth > 0.6 ? "disagree" : "dunk") : payload.score > 15 ? "praise" : rng.pick(["agree_add", "question", "joke", "relate"] as const);
  const content = generateReply(stance, { topic: post.topic_id ?? sim.interests[0], hook: extractHook(post.content) }, voiceOf(sim), rng);
  check(await db.from("posts").insert({
    world_id: world.id, author_type: "sim", author_simulated_account_id: sim.id, post_type: "reply", parent_post_id: post.id, root_post_id: post.root_post_id ?? post.id,
    content, topic_id: post.topic_id, stance, sim_tick: world.current_tick,
  }), "insert_reply_back");
  check(await db.rpc("adjust_post_counts", { p: post.id, d_like: 0, d_reply: 1, d_repost: 0, d_quote: 0, d_view: 0 }), "inc_reply_back");
  await notify(db, world.id, player.user_id, { type: "reply", title: `@${sim.username} replied to you`, body: content, sourceType: "post", sourceId: post.id, actorId: sim.id, priority: 2 });
}

export async function setInteraction(db: Db, world: WorldRow, player: PlayerRow, postId: string, type: "like" | "repost" | "bookmark", on: boolean): Promise<{ active: boolean }> {
  const post = await loadPost(db, world.id, postId);
  if (post.author_player_id === player.id && type !== "bookmark") throw new HttpError(400, `You can't ${type} your own post.`, "invalid_action");
  if (on) {
    const res = await db.from("post_interactions").insert({ world_id: world.id, post_id: post.id, actor_type: "player", actor_player_id: player.id, interaction_type: type });
    if (res.error) {
      if (res.error.code === "23505") return { active: true };
      check(res, "insert_player_interaction");
    }
  } else {
    const del = check(await db.from("post_interactions").delete().eq("post_id", post.id).eq("actor_player_id", player.id).eq("interaction_type", type).select("id"), "delete_player_interaction") as unknown[];
    if (!del.length) return { active: false };
  }
  if (type !== "bookmark") {
    const d = on ? 1 : -1;
    check(await db.rpc("adjust_post_counts", { p: post.id, d_like: type === "like" ? d : 0, d_reply: 0, d_repost: type === "repost" ? d : 0, d_quote: 0, d_view: 0 }), "adjust_interaction_counts");
  }
  if (on && type !== "bookmark" && post.author_type === "sim" && post.author_simulated_account_id) {
    const sim = await loadSim(db, world.id, post.author_simulated_account_id);
    // Smaller accounts notice individual likes; big accounts mostly notice reposts.
    if (sim && (type === "repost" || sim.fame < 35)) {
      await updateRelationship(db, world.id, { aType: "sim", aId: sim.id, bType: "player", bId: player.id, kind: type, reason: type === "repost" ? "you boosted their post" : "you liked their post", postId: post.id, multiplier: type === "repost" ? 1 + player.fame / 50 : 1 });
      if (type === "repost" && player.fame > sim.fame && sim.fame < 40) {
        await remember(db, world.id, sim.id, { entityType: "player", entityId: player.id, type: "amplified", summary: `@${player.username} boosted my post to their audience`, importance: 0.6, sentiment: 0.7, postId: post.id });
        const gain = clamp((player.fame - sim.fame) / 20, 0.2, 3);
        check(await db.from("simulated_accounts").update({ fame: clamp(sim.fame + gain, 0, 100), follower_count_cache: sim.follower_count_cache + Math.round(player.follower_count * 0.05 + 1) }).eq("id", sim.id), "sim_boost");
      }
    }
  }
  return { active: on };
}

export async function setFollow(db: Db, world: WorldRow, player: PlayerRow, simId: string, on: boolean): Promise<{ following: boolean; followedBack: boolean }> {
  const sim = await loadSim(db, world.id, simId);
  if (!sim) throw new HttpError(404, "Account not found.", "not_found");
  let followedBack = false;
  if (on) {
    const blocked = check(await db.from("player_filters").select("id").eq("player_id", player.id).eq("target_simulated_account_id", sim.id).eq("kind", "block").maybeSingle(), "check_block");
    if (blocked) throw new HttpError(400, "Unblock this account first.", "invalid_action");
    const res = await db.from("follows").insert({ world_id: world.id, follower_type: "player", follower_player_id: player.id, followed_type: "sim", followed_simulated_account_id: sim.id, reason: "player" });
    if (res.error && res.error.code !== "23505") check(res, "insert_follow");
    if (!res.error) {
      check(await db.from("simulated_accounts").update({ follower_count_cache: sim.follower_count_cache + 1 }).eq("id", sim.id), "sim_follower_inc");
      const rel = await updateRelationship(db, world.id, { aType: "sim", aId: sim.id, bType: "player", bId: player.id, kind: "follow", reason: "you followed them", multiplier: 0.5 });
      const rng = new Rng(`${world.seed}:followback:${player.id}:${sim.id}`);
      const t = sim.personality_traits;
      const pBack = clamp(0.06 + t.sociability * 0.25 + rel.score / 150 + (player.fame - sim.fame) / 150 + (sim.interests.some((i) => player.interests.includes(i)) ? 0.08 : 0), 0.01, 0.8);
      if (rng.chance(pBack)) {
        const fb = await db.from("follows").insert({ world_id: world.id, follower_type: "sim", follower_simulated_account_id: sim.id, followed_type: "player", followed_player_id: player.id, reason: "organic" });
        if (!fb.error) {
          followedBack = true;
          await notify(db, world.id, player.user_id, { type: "new_follower", title: `@${sim.username} followed you back`, actorId: sim.id, sourceType: "sim", sourceId: sim.id, priority: 2 });
        }
      }
    }
  } else {
    const del = check(await db.from("follows").delete().eq("follower_player_id", player.id).eq("followed_simulated_account_id", sim.id).select("id"), "delete_follow") as unknown[];
    if (del.length) {
      check(await db.from("simulated_accounts").update({ follower_count_cache: Math.max(0, sim.follower_count_cache - 1) }).eq("id", sim.id), "sim_follower_dec");
      const followsBack = check(await db.from("follows").select("id").eq("follower_simulated_account_id", sim.id).eq("followed_player_id", player.id).maybeSingle(), "check_followback");
      if (followsBack) await updateRelationship(db, world.id, { aType: "sim", aId: sim.id, bType: "player", bId: player.id, kind: "unfollow", reason: "you unfollowed them", multiplier: 0.5 });
    }
  }
  await refreshPlayerCounts(db, player.id);
  const fresh = check(await db.from("player_world_state").select("*").eq("id", player.id).single(), "reload_after_follow") as PlayerRow;
  await evaluateAchievements(db, world, fresh, {});
  return { following: on, followedBack };
}

export async function setFilter(db: Db, world: WorldRow, player: PlayerRow, simId: string, kind: "mute" | "block", on: boolean): Promise<void> {
  const sim = await loadSim(db, world.id, simId);
  if (!sim) throw new HttpError(404, "Account not found.", "not_found");
  if (on) {
    const res = await db.from("player_filters").insert({ world_id: world.id, player_id: player.id, target_simulated_account_id: sim.id, kind });
    if (res.error && res.error.code !== "23505") check(res, "insert_filter");
    if (kind === "block") {
      check(await db.from("follows").delete().eq("follower_player_id", player.id).eq("followed_simulated_account_id", sim.id), "block_unfollow");
      check(await db.from("follows").delete().eq("follower_simulated_account_id", sim.id).eq("followed_player_id", player.id), "block_remove_follower");
      await refreshPlayerCounts(db, player.id);
    }
  } else {
    check(await db.from("player_filters").delete().eq("player_id", player.id).eq("target_simulated_account_id", sim.id).eq("kind", kind), "delete_filter");
  }
}

export async function setCommunity(db: Db, world: WorldRow, player: PlayerRow, communityId: string, on: boolean): Promise<void> {
  const community = check(await db.from("communities").select("id, member_count").eq("world_id", world.id).eq("id", communityId).maybeSingle(), "load_community") as { id: string; member_count: number } | null;
  if (!community) throw new HttpError(404, "Community not found.", "not_found");
  if (on) {
    const res = await db.from("community_memberships").insert({ world_id: world.id, community_id: community.id, member_type: "player", player_id: player.id });
    if (res.error && res.error.code !== "23505") check(res, "join_community");
    if (!res.error) check(await db.from("communities").update({ member_count: community.member_count + 1 }).eq("id", community.id), "community_inc");
  } else {
    const del = check(await db.from("community_memberships").delete().eq("community_id", community.id).eq("player_id", player.id).select("id"), "leave_community") as unknown[];
    if (del.length) check(await db.from("communities").update({ member_count: Math.max(0, community.member_count - 1) }).eq("id", community.id), "community_dec");
  }
}

type Choice = "apologize" | "stand_firm" | "ignore" | "clarify";

/** Strategic responses to controversies and feuds. Trade-offs, no single right answer. */
export async function respondToEvent(db: Db, world: WorldRow, player: PlayerRow, eventId: string, choice: Choice): Promise<{ summary: string }> {
  const ev = check(await db.from("world_events").select("*").eq("world_id", world.id).eq("id", eventId).maybeSingle(), "load_event") as { id: string; event_type: string; involves_player: boolean; status: string; player_response: string | null; related_account_ids: string[]; event_data: { choices?: string[]; counterpart?: string } } | null;
  if (!ev || !ev.involves_player) throw new HttpError(404, "Event not found.", "not_found");
  if (ev.player_response) throw new HttpError(409, "You already responded to this.", "already_responded");
  if (!ev.event_data?.choices?.includes(choice)) throw new HttpError(400, "That response isn't available here.", "invalid_action");

  const deltas: AttrDelta[] = [];
  let summary = "";
  let status = ev.status;
  const counterpartId = ev.related_account_ids[0];
  if (choice === "apologize") {
    deltas.push({ attribute: "infamy", delta: -4, reason: "Publicly apologized" }, { attribute: "controversy", delta: -5, reason: "Apology cooled the debate" },
      { attribute: "admiration", delta: 2, reason: "Apology was received as sincere by many" }, { attribute: "audience_loyalty", delta: -1.5, reason: "Some supporters wanted you to hold your ground" });
    status = "resolved";
    summary = "You apologized. The heat dropped, though a few supporters were disappointed.";
  } else if (choice === "stand_firm") {
    deltas.push({ attribute: "controversy", delta: 4, reason: "Doubled down publicly" }, { attribute: "audience_loyalty", delta: 2.5, reason: "Core supporters rallied behind you" },
      { attribute: "infamy", delta: 2, reason: "Doubling down extended the story" }, { attribute: "fame", delta: 1, reason: "The standoff drew more eyes" }, { attribute: "admiration", delta: -1.5, reason: "Neutral observers were put off" });
    status = "escalating";
    summary = "You stood firm. Your base rallied, the story got bigger, and some people tuned out.";
  } else if (choice === "clarify") {
    deltas.push({ attribute: "credibility", delta: 2, reason: "Clarified your position with specifics" }, { attribute: "controversy", delta: -2, reason: "Clarification narrowed the disagreement" });
    status = "resolved";
    summary = "You clarified. Fewer people are arguing past you now.";
  } else {
    deltas.push({ attribute: "controversy", delta: -1, reason: "Chose not to engage" });
    summary = "You stayed quiet. The story will fade on its own schedule.";
  }
  const fresh = await applyReputation(db, world, player, deltas, { eventId: ev.id, snapshotLabel: choice === "apologize" ? "Apology" : choice === "stand_firm" ? "Stood firm" : null });
  check(await db.from("world_events").update({ player_response: choice, status, ended_at: status === "resolved" ? new Date().toISOString() : null }).eq("id", ev.id), "record_response");
  for (const d of deltas) await recordEffect(db, world.id, ev.id, "player", player.id, d.attribute, null, d.delta, { reason: d.reason });

  if (counterpartId) {
    const sim = await loadSim(db, world.id, counterpartId);
    if (sim) {
      const kind = choice === "apologize" ? "apology" : choice === "stand_firm" ? "player_mention_hostile" : "joke";
      const rel = await updateRelationship(db, world.id, { aType: "sim", aId: sim.id, bType: "player", bId: player.id, kind, reason: choice === "apologize" ? "you apologized" : choice === "stand_firm" ? "you doubled down" : "you let it go", eventId: ev.id, multiplier: choice === "stand_firm" ? 0.5 : 1 });
      await remember(db, world.id, sim.id, { entityType: "player", entityId: player.id, type: choice === "apologize" ? "reconciliation" : "public_dispute", summary: choice === "apologize" ? `@${player.username} apologized after our dispute` : `@${player.username} doubled down`, importance: 0.7, sentiment: choice === "apologize" ? 0.5 : -0.5, eventId: ev.id });
      const rng = new Rng(`${world.seed}:resp:${ev.id}`);
      if (choice === "apologize" && sim.personality_traits.openness + sim.personality_traits.warmth > rng.range(0.6, 1.4)) {
        const text = generatePost("reconciliation", { topic: sim.interests[0], mention: `@${player.username}` }, voiceOf(sim), rng);
        check(await db.from("posts").insert({ world_id: world.id, author_type: "sim", author_simulated_account_id: sim.id, post_type: "post", content: text, topic_id: sim.interests[0], stance: "reconciliation", sim_tick: world.current_tick, like_count: Math.round(sim.follower_count_cache * 0.02) }), "insert_reconcile_post");
        await createEvent(db, world, { type: "surprise_reconciliation", category: "community", title: "Surprise reconciliation", description: `@${player.username} and @${sim.username} buried the hatchet after a public apology.`, severity: 2, involvesPlayer: true, accountIds: [sim.id], status: "resolved" });
        summary += ` @${sim.username} accepted publicly.`;
      } else if (choice === "stand_firm" && rel.score < -20) {
        const text = generatePost("feud_jab", { topic: sim.interests[0], mention: `@${player.username}` }, voiceOf(sim), rng);
        check(await db.from("posts").insert({ world_id: world.id, author_type: "sim", author_simulated_account_id: sim.id, post_type: "post", content: text, topic_id: sim.interests[0], stance: "feud_jab", sim_tick: world.current_tick, like_count: Math.round(sim.follower_count_cache * 0.03) }), "insert_escalation_post");
        summary += ` @${sim.username} fired back.`;
      }
    }
  }
  await evaluateAchievements(db, world, fresh, { sourceEventId: ev.id });
  return { summary };
}

export async function respondToCollab(db: Db, world: WorldRow, player: PlayerRow, notificationId: string, accept: boolean): Promise<{ summary: string }> {
  const n = check(await db.from("notifications").select("*").eq("id", notificationId).eq("recipient_user_id", player.user_id).eq("world_id", world.id).maybeSingle(), "load_collab_notif") as { id: string; action_state: string | null; source_entity_id: string; actor_ids: string[] } | null;
  if (!n || n.action_state !== "pending") throw new HttpError(409, "This invitation is no longer open.", "invalid_action");
  const sim = await loadSim(db, world.id, n.actor_ids[0]);
  if (!sim) throw new HttpError(404, "Account not found.", "not_found");
  check(await db.from("notifications").update({ action_state: accept ? "accepted" : "declined", read_at: new Date().toISOString() }).eq("id", n.id).eq("action_state", "pending"), "update_collab_notif");
  if (!accept) {
    await updateRelationship(db, world.id, { aType: "sim", aId: sim.id, bType: "player", bId: player.id, kind: "collab_declined", reason: "you declined their collaboration" });
    return { summary: `You passed on the collab with @${sim.username}.` };
  }
  const rng = new Rng(`${world.seed}:collab:${n.id}`);
  const fameGain = clamp((sim.fame - player.fame) / 8 + 1.5, 0.5, 6);
  const evId = await createEvent(db, world, {
    type: "creator_collaboration", category: "creator", title: "Creator collaboration",
    description: `@${player.username} and @${sim.username} teamed up on a ${sim.interests[0]} project. Both audiences got introduced to each other.`,
    severity: 2, involvesPlayer: true, accountIds: [sim.id], status: "resolved",
  });
  await updateRelationship(db, world.id, { aType: "sim", aId: sim.id, bType: "player", bId: player.id, kind: "collab", reason: "you collaborated", eventId: evId });
  await remember(db, world.id, sim.id, { entityType: "player", entityId: player.id, type: "collaboration", summary: `Collaborated with @${player.username}`, importance: 0.9, sentiment: 0.8, eventId: evId });
  const text = generatePost("collab_announce", { topic: sim.interests[0], mention: `@${player.username}` }, voiceOf(sim), rng);
  check(await db.from("posts").insert({ world_id: world.id, author_type: "sim", author_simulated_account_id: sim.id, post_type: "post", content: text, topic_id: sim.interests[0], stance: "collab_announce", sim_tick: world.current_tick, like_count: Math.round(sim.follower_count_cache * 0.03), view_count: Math.round(sim.follower_count_cache * 0.3) }), "insert_collab_post");
  // Some of the collaborator's audience discovers the player.
  const audience = check(await db.from("follows").select("follower_simulated_account_id").eq("followed_simulated_account_id", sim.id).limit(50), "collab_audience") as { follower_simulated_account_id: string }[];
  let gained = 0;
  for (const a of rng.sample(audience, rng.int(1, Math.max(1, Math.round(audience.length * 0.2))))) {
    const r = await db.from("follows").insert({ world_id: world.id, follower_type: "sim", follower_simulated_account_id: a.follower_simulated_account_id, followed_type: "player", followed_player_id: player.id, reason: "organic" });
    if (!r.error) gained++;
  }
  await refreshPlayerCounts(db, player.id);
  let fresh = check(await db.from("player_world_state").select("*").eq("id", player.id).single(), "reload_collab") as PlayerRow;
  fresh = await applyReputation(db, world, fresh, [
    { attribute: "fame", delta: fameGain, reason: `Collaboration with @${sim.username}` },
    { attribute: "admiration", delta: 2, reason: "Collaboration was well received" },
    { attribute: "connection_strength", delta: 4 + sim.fame / 15, reason: `New working relationship with @${sim.username}` },
  ], { eventId: evId, snapshotLabel: `Collab with @${sim.username}` });
  await evaluateAchievements(db, world, fresh, { collab: true, sourceEventId: evId });
  return { summary: `Collab with @${sim.username} is live. ${gained} of their followers found you.` };
}

