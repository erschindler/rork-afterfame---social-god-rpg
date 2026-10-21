/** Player persona creation, starting conditions, and offline summaries. */
import { check, type Db, HttpError } from "../http.ts";
import { Rng } from "../sim/rng.ts";
import { ALL_TOPICS } from "../sim/config.ts";
import { type PlayerRow, type WorldRow } from "./types.ts";
import { notify, population } from "./store.ts";
import { ensureChallenges } from "./challenges.ts";
import { insertBatched } from "./util.ts";

export interface PersonaInput {
  displayName: string;
  username: string;
  bio: string;
  avatar: string;
  interests: string[];
  startingCondition: "ordinary" | "niche" | "creator";
  nicheTopic?: string | null;
}

export function validatePersona(raw: Record<string, unknown>): PersonaInput {
  const displayName = String(raw.displayName ?? "").trim();
  const username = String(raw.username ?? "").trim().toLowerCase().replace(/^@/, "");
  const bio = String(raw.bio ?? "").trim();
  const avatar = String(raw.avatar ?? "").trim().slice(0, 80) || username;
  const interests = Array.isArray(raw.interests) ? raw.interests.filter((i): i is string => typeof i === "string" && ALL_TOPICS.includes(i)).slice(0, 6) : [];
  const sc = String(raw.startingCondition ?? "ordinary");
  if (displayName.length < 1 || displayName.length > 50) throw new HttpError(400, "Display name must be 1–50 characters.", "invalid_input");
  if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new HttpError(400, "Username must be 3–20 characters: letters, numbers, underscores.", "invalid_input");
  if (bio.length > 160) throw new HttpError(400, "Bio must be 160 characters or less.", "invalid_input");
  if (interests.length < 1) throw new HttpError(400, "Pick at least one interest.", "invalid_input");
  if (!["ordinary", "niche", "creator"].includes(sc)) throw new HttpError(400, "Invalid starting condition.", "invalid_input");
  const nicheTopic = sc === "niche" ? (typeof raw.nicheTopic === "string" && interests.includes(raw.nicheTopic) ? raw.nicheTopic : interests[0]) : null;
  return { displayName, username, bio, avatar, interests, startingCondition: sc as PersonaInput["startingCondition"], nicheTopic };
}

/** Idempotent: returns the existing persona if one exists for this user in this world. */
export async function createPersona(db: Db, world: WorldRow, userId: string, p: PersonaInput): Promise<PlayerRow> {
  const existing = check(await db.from("player_world_state").select("*").eq("world_id", world.id).eq("user_id", userId).maybeSingle(), "existing_persona") as PlayerRow | null;
  if (existing) return existing;
  const taken = check(await db.from("simulated_accounts").select("id").eq("world_id", world.id).eq("username", p.username).maybeSingle(), "username_sim_check");
  if (taken) throw new HttpError(409, "That username is taken in this world.", "username_taken");

  const base = {
    ordinary: { credibility: 50, niche: 0, fame: 0, followers: [3, 6] },
    niche: { credibility: 56, niche: 12, fame: 1, followers: [10, 16] },
    creator: { credibility: 50, niche: 0, fame: 3, followers: [14, 22] },
  }[p.startingCondition];

  const ins = await db.from("player_world_state").insert({
    world_id: world.id, user_id: userId, display_name: p.displayName, username: p.username, bio: p.bio, avatar_reference: p.avatar, interests: p.interests,
    starting_condition: p.startingCondition, niche_topic: p.nicheTopic, credibility: base.credibility, niche_authority: base.niche, fame: base.fame,
    last_seen_at: new Date().toISOString(), last_seen_tick: world.current_tick,
  }).select("*").single();
  if (ins.error?.code === "23505") throw new HttpError(409, "That username is taken in this world.", "username_taken");
  let player = check(ins, "insert_persona") as PlayerRow;

  // Small, plausible starting audience drawn from people who share your interests.
  const rng = new Rng(`${world.seed}:start:${userId}`);
  const topic = p.nicheTopic ?? p.interests[0];
  const pool = check(await db.from("simulated_accounts").select("id, archetype, fame").eq("world_id", world.id).overlaps("interests", p.startingCondition === "niche" ? [topic] : p.interests).lt("fame", 30).limit(200), "start_pool") as { id: string; archetype: string; fame: number }[];
  const n = Math.min(pool.length, rng.int(base.followers[0], base.followers[1]));
  const followers = rng.sample(pool, n);
  await insertBatched(db, "follows", followers.map((f) => ({ world_id: world.id, follower_type: "sim", follower_simulated_account_id: f.id, followed_type: "player", followed_player_id: player.id, reason: "starting audience" })));
  if (followers.length) {
    await insertBatched(db, "relationships", followers.map((f) => ({ world_id: world.id, account_a_type: "sim", account_a_id: f.id, account_b_type: "player", account_b_id: player.id, relationship_score: 4, relationship_status: "acquaintance", interaction_count: 0 })));
  }
  check(await db.rpc("refresh_player_counts", { pid: player.id }), "start_counts");
  player = check(await db.from("player_world_state").select("*").eq("id", player.id).single(), "reload_persona") as PlayerRow;
  check(await db.from("fame_snapshots").insert({ world_id: world.id, player_id: player.id, sim_tick: world.current_tick, fame: player.fame, admiration: player.admiration, infamy: player.infamy, credibility: player.credibility, influence: player.influence, controversy: player.controversy, followers: player.follower_count, label: "Joined" }), "start_snapshot");

  // Auto-join the community that matches your main interest.
  const def = check(await db.from("communities").select("id, member_count").eq("world_id", world.id).eq("topic_id", topic).maybeSingle(), "start_community") as { id: string; member_count: number } | null;
  if (def) {
    const j = await db.from("community_memberships").insert({ world_id: world.id, community_id: def.id, member_type: "player", player_id: player.id });
    if (!j.error) await db.from("communities").update({ member_count: def.member_count + 1 }).eq("id", def.id);
  }
  await ensureChallenges(db, player);
  await notify(db, world.id, userId, {
    type: "major_event", title: "Welcome to the world",
    body: `${population(world).toLocaleString()} fictional people live here. ${followers.length} of them already follow you. Post something and see who notices.`, priority: 2,
  });
  return player;
}

export interface OfflineSummary {
  away: string;
  items: { id: string; title: string; description: string; event_type: string; involves_player: boolean; started_at: string }[];
  unread: number;
}

/** Summarize recorded events since the player last looked. Every item is a real event row. */
export async function offlineSummary(db: Db, world: WorldRow, player: PlayerRow): Promise<OfflineSummary | null> {
  const last = player.last_seen_at ? Date.parse(player.last_seen_at) : Date.now();
  const awayMs = Date.now() - last;
  check(await db.from("player_world_state").update({ last_seen_at: new Date().toISOString(), last_seen_tick: world.current_tick }).eq("id", player.id), "touch_seen");
  if (awayMs < 30 * 60_000) return null;
  const events = check(await db.from("world_events").select("id, title, description, event_type, involves_player, started_at, severity").eq("world_id", world.id).gt("started_at", new Date(last).toISOString()).order("severity", { ascending: false }).order("started_at", { ascending: false }).limit(12), "offline_events") as (OfflineSummary["items"][number] & { severity: number })[];
  if (!events.length) return null;
  const sorted = [...events.filter((e) => e.involves_player), ...events.filter((e) => !e.involves_player)].slice(0, 3);
  const unread = await db.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_user_id", player.user_id).eq("world_id", world.id).is("read_at", null);
  const hours = Math.round(awayMs / 3_600_000);
  return { away: hours >= 24 ? `${Math.round(hours / 24)} days` : hours >= 1 ? `${hours} hours` : "a little while", items: sorted, unread: unread.count ?? 0 };
}
