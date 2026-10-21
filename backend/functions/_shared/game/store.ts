/** Authoritative state mutations shared by all gameplay modules. */
import { check, type Db, HttpError, log } from "../http.ts";
import { clamp, round1 } from "../sim/rng.ts";
import type { AttrDelta, PlayerAttrs } from "../sim/reputation.ts";
import { computeNotoriety, computeRank, influenceTarget } from "../sim/reputation.ts";
import { applyDelta, INTERACTION_DELTA, statusFor } from "../sim/relations.ts";
import { POPULATION } from "../sim/config.ts";
import type { PlayerRow, WorldRow } from "./types.ts";

export async function loadContext(db: Db, userId: string, worldId: string): Promise<{ world: WorldRow; player: PlayerRow }> {
  const [memberRes, worldRes, playerRes] = await Promise.all([
    db.from("world_members").select("status").eq("world_id", worldId).eq("user_id", userId).maybeSingle(),
    db.from("worlds").select("*").eq("id", worldId).maybeSingle(),
    db.from("player_world_state").select("*").eq("world_id", worldId).eq("user_id", userId).maybeSingle(),
  ]);
  const member = check(memberRes, "load_member") as { status: string } | null;
  // Membership is checked before revealing anything about the world.
  if (!member || member.status !== "active") throw new HttpError(403, "You don't have access to this world.", "forbidden");
  const world = check(worldRes, "load_world") as WorldRow;
  if (world.status !== "ready") throw new HttpError(409, "This world is still being set up.", "world_not_ready");
  const player = check(playerRes, "load_player") as PlayerRow | null;
  if (!player) throw new HttpError(409, "Create your persona first.", "no_persona");
  return { world, player };
}

export const population = (w: WorldRow): number => POPULATION[w.world_size];

const ATTR_KEYS: (keyof PlayerAttrs)[] = [
  "fame", "admiration", "infamy", "credibility", "influence", "controversy", "audience_loyalty", "niche_authority", "connection_strength", "fatigue",
];

/**
 * Apply attribute deltas to the player, log every change to reputation_history,
 * recompute influence and ranks, and write a fame snapshot. Returns new player.
 */
export async function applyReputation(
  db: Db,
  world: WorldRow,
  player: PlayerRow,
  deltas: AttrDelta[],
  src: { postId?: string | null; eventId?: string | null; snapshotLabel?: string | null; skipSnapshot?: boolean },
): Promise<PlayerRow> {
  const next: PlayerRow = { ...player };
  const history: Record<string, unknown>[] = [];
  for (const d of deltas) {
    const prev = Number(next[d.attribute]);
    const val = round1(clamp(prev + d.delta, 0, 100));
    if (val === prev) continue;
    (next as unknown as Record<string, number>)[d.attribute] = val;
    if (d.attribute !== "fatigue") {
      history.push({
        world_id: world.id, player_user_id: player.user_id, player_id: player.id, attribute_name: d.attribute,
        previous_value: prev, new_value: val, delta: round1(val - prev), reason: d.reason,
        source_post_id: src.postId ?? null, source_event_id: src.eventId ?? null,
      });
    }
  }
  const pop = population(world);
  const target = influenceTarget(next, next.follower_count / pop);
  const infl = round1(next.influence + (target - next.influence) * 0.25);
  if (Math.abs(infl - next.influence) >= 0.3) {
    history.push({
      world_id: world.id, player_user_id: player.user_id, player_id: player.id, attribute_name: "influence",
      previous_value: next.influence, new_value: infl, delta: round1(infl - next.influence),
      reason: infl > next.influence ? "Reach and trust strengthened your influence" : "Influence eased as attention shifted",
      source_post_id: src.postId ?? null, source_event_id: src.eventId ?? null,
    });
    next.influence = infl;
  }
  const rank = computeRank({ fame: next.fame, influence: next.influence, followers: next.follower_count, outsideReach: next.outside_reach, viralPosts: next.viral_posts, population: pop });
  const notoriety = computeNotoriety(next.infamy);
  const rankChanged = rank.rank !== player.current_rank;
  const notorietyChanged = notoriety !== player.notoriety_rank;
  next.current_rank = rank.rank;
  next.notoriety_rank = notoriety;

  const patch: Record<string, unknown> = { current_rank: next.current_rank, notoriety_rank: next.notoriety_rank, updated_at: new Date().toISOString() };
  for (const k of ATTR_KEYS) patch[k] = next[k];
  check(await db.from("player_world_state").update(patch).eq("id", player.id), "update_player_attrs");
  if (history.length) check(await db.from("reputation_history").insert(history), "insert_rep_history");

  if (!src.skipSnapshot && (history.length > 0 || src.snapshotLabel)) {
    check(
      await db.from("fame_snapshots").insert({
        world_id: world.id, player_id: player.id, sim_tick: world.current_tick, fame: next.fame, admiration: next.admiration,
        infamy: next.infamy, credibility: next.credibility, influence: next.influence, controversy: next.controversy,
        followers: next.follower_count, label: src.snapshotLabel ?? null,
      }),
      "insert_snapshot",
    );
  }
  if (rankChanged) {
    const up = rank.index > rankIndex(player.current_rank);
    await notify(db, world.id, player.user_id, {
      type: "fame_milestone",
      title: up ? `You are now ${rank.rank}` : `You slipped to ${rank.rank}`,
      body: up ? "People across the world are starting to know your name." : "Attention moved on. You can win it back.",
      priority: 3,
    });
    if (up) {
      await createEvent(db, world, {
        type: "rank_up", category: "reputation", title: `@${player.username} reached ${rank.rank}`,
        description: `@${player.username} climbed to the ${rank.rank} rank after sustained growth in reach and recognition.`,
        severity: Math.min(5, rank.index + 1), involvesPlayer: true, sourceType: "player", sourceId: player.id,
      });
    }
  }
  if (notorietyChanged && notoriety !== "Unknown" && computeNotorietyIndex(notoriety) > computeNotorietyIndex(player.notoriety_rank)) {
    await notify(db, world.id, player.user_id, { type: "fame_milestone", title: `Notoriety: ${notoriety}`, body: "Your name now comes with a warning label for some people.", priority: 3 });
  }
  return next;
}

function rankIndex(name: string): number {
  return ["Nobody", "Recognized", "Rising Name", "Notable", "Celebrity", "Cultural Force", "Legend"].indexOf(name);
}
function computeNotorietyIndex(name: string): number {
  return ["Unknown", "Troublemaker", "Notorious", "Internet Villain", "Infamous Legend"].indexOf(name);
}

export interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  sourceType?: string;
  sourceId?: string | null;
  actorId?: string | null;
  batchKey?: string;
  priority?: number;
  actionState?: string;
}

/** Create or batch a notification. Minor events with the same batch key collapse into one row. */
export async function notify(db: Db, worldId: string, userId: string, n: NotifyInput): Promise<void> {
  if (n.batchKey) {
    const existing = check(
      await db.from("notifications").select("id, batch_count, actor_ids").eq("recipient_user_id", userId).eq("world_id", worldId)
        .eq("batch_key", n.batchKey).is("read_at", null).maybeSingle(),
      "find_batch_notif",
    ) as { id: string; batch_count: number; actor_ids: string[] } | null;
    if (existing) {
      const actors = n.actorId && !existing.actor_ids.includes(n.actorId) ? [n.actorId, ...existing.actor_ids].slice(0, 8) : existing.actor_ids;
      check(
        await db.from("notifications").update({ batch_count: existing.batch_count + 1, actor_ids: actors, title: n.title, body: n.body ?? "", created_at: new Date().toISOString() }).eq("id", existing.id),
        "update_batch_notif",
      );
      return;
    }
  }
  const res = await db.from("notifications").insert({
    world_id: worldId, recipient_user_id: userId, notification_type: n.type, title: n.title, body: n.body ?? "",
    source_entity_type: n.sourceType ?? null, source_entity_id: n.sourceId ?? null, actor_ids: n.actorId ? [n.actorId] : [],
    batch_key: n.batchKey ?? null, priority: n.priority ?? 1, action_state: n.actionState ?? null,
  });
  if (res.error && res.error.code !== "23505") check(res, "insert_notif");
}

export interface EventInput {
  type: string;
  category: string;
  title: string;
  description: string;
  severity: number;
  involvesPlayer?: boolean;
  sourceType?: string;
  sourceId?: string | null;
  accountIds?: string[];
  postIds?: string[];
  data?: Record<string, unknown>;
  status?: string;
}

export async function createEvent(db: Db, world: WorldRow, e: EventInput): Promise<string> {
  const row = check(
    await db.from("world_events").insert({
      world_id: world.id, event_type: e.type, category: e.category, title: e.title, description: e.description,
      severity: clamp(Math.round(e.severity), 1, 5), involves_player: e.involvesPlayer ?? false,
      source_entity_type: e.sourceType ?? null, source_entity_id: e.sourceId ?? null,
      related_account_ids: e.accountIds ?? [], related_post_ids: e.postIds ?? [], event_data: e.data ?? {},
      status: e.status ?? "active", sim_tick: world.current_tick,
    }).select("id").single(),
    "insert_event",
  ) as { id: string };
  return row.id;
}

export async function recordEffect(db: Db, worldId: string, eventId: string, targetType: string, targetId: string, effect: string, prev: number | null, next: number | null, data: Record<string, unknown> = {}): Promise<void> {
  check(
    await db.from("event_effects").insert({ world_id: worldId, event_id: eventId, target_entity_type: targetType, target_entity_id: targetId, effect_type: effect, previous_value: prev, new_value: next, effect_data: data }),
    "insert_effect",
  );
}

export interface RelUpdate {
  aType: "player" | "sim";
  aId: string;
  bType: "player" | "sim";
  bId: string;
  kind: keyof typeof INTERACTION_DELTA | string;
  reason: string;
  postId?: string | null;
  eventId?: string | null;
  hostile?: boolean;
  multiplier?: number;
}

/**
 * Update the directed relationship of A toward B (sims' feelings toward the player
 * are stored as a=sim, b=player). Logs the change with its reason.
 */
export async function updateRelationship(db: Db, worldId: string, u: RelUpdate): Promise<{ score: number; status: string; prevStatus: string; delta: number }> {
  const base = INTERACTION_DELTA[u.kind] ?? 0;
  const delta = base * (u.multiplier ?? 1);
  const existing = check(
    await db.from("relationships").select("*").eq("world_id", worldId).eq("account_a_type", u.aType).eq("account_a_id", u.aId)
      .eq("account_b_type", u.bType).eq("account_b_id", u.bId).maybeSingle(),
    "load_rel",
  ) as { id: string; relationship_score: number; peak_score: number; relationship_status: string; interaction_count: number; hostile_count: number } | null;

  const prevScore = existing?.relationship_score ?? 0;
  const score = applyDelta(prevScore, delta);
  const peak = Math.max(existing?.peak_score ?? 0, score);
  const hostile = (existing?.hostile_count ?? 0) + (u.hostile || delta <= -4 ? 1 : 0);
  const collabs = u.kind === "collab" ? 1 : existing?.relationship_status === "collaborator" ? 1 : 0;
  const status = statusFor(score, peak, hostile, collabs);
  const prevStatus = existing?.relationship_status ?? "acquaintance";
  const now = new Date().toISOString();

  let relId = existing?.id;
  if (existing) {
    check(
      await db.from("relationships").update({ relationship_score: score, peak_score: peak, relationship_status: status, interaction_count: existing.interaction_count + 1, hostile_count: hostile, last_interaction_at: now, updated_at: now }).eq("id", existing.id),
      "update_rel",
    );
  } else {
    const ins = await db.from("relationships").insert({
      world_id: worldId, account_a_type: u.aType, account_a_id: u.aId, account_b_type: u.bType, account_b_id: u.bId,
      relationship_score: score, peak_score: peak, relationship_status: status, interaction_count: 1, hostile_count: hostile, last_interaction_at: now,
    }).select("id").single();
    if (ins.error?.code === "23505") return { score: prevScore, status: prevStatus, prevStatus, delta: 0 };
    relId = (check(ins, "insert_rel") as { id: string }).id;
  }
  if (Math.abs(score - prevScore) >= 2 || status !== prevStatus) {
    check(
      await db.from("relationship_events").insert({ world_id: worldId, relationship_id: relId, delta: round1(score - prevScore), new_score: score, reason: u.reason, source_post_id: u.postId ?? null, source_event_id: u.eventId ?? null }),
      "insert_rel_event",
    );
  }
  return { score, status, prevStatus, delta: score - prevScore };
}

export async function remember(
  db: Db,
  worldId: string,
  simId: string,
  m: { entityType: string; entityId: string | null; type: string; summary: string; importance: number; sentiment: number; postId?: string | null; eventId?: string | null },
): Promise<void> {
  const res = await db.from("account_memories").insert({
    world_id: worldId, simulated_account_id: simId, related_entity_type: m.entityType, related_entity_id: m.entityId,
    memory_type: m.type, summary: m.summary.slice(0, 280), importance: clamp(m.importance, 0, 1), sentiment: clamp(m.sentiment, -1, 1),
    source_post_id: m.postId ?? null, source_event_id: m.eventId ?? null,
  });
  if (res.error) log("warn", "memory_insert_failed", { message: res.error.message });
}

export async function refreshPlayerCounts(db: Db, playerId: string): Promise<void> {
  check(await db.rpc("refresh_player_counts", { pid: playerId }), "refresh_counts");
}
