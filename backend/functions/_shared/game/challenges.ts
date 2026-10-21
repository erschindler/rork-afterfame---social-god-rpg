/** Optional daily challenges + forgiving streaks. Built only from real mechanics. */
import { check, type Db } from "../http.ts";
import { Rng } from "../sim/rng.ts";
import type { PlayerRow } from "./types.ts";
import { notify } from "./store.ts";
import { todayUtc } from "./util.ts";

interface ChallengeDef {
  code: string;
  title: string;
  description: string;
  target: number;
}

const POOL: ChallengeDef[] = [
  { code: "new_topic", title: "Try a new topic", description: "Publish a post in a topic you rarely discuss.", target: 1 },
  { code: "thoughtful_replies", title: "Reply thoughtfully", description: "Reply thoughtfully to 3 posts (60+ characters, no hostility).", target: 3 },
  { code: "community_post", title: "Join the conversation", description: "Post in the topic of a community you belong to.", target: 1 },
  { code: "gain_follower", title: "Earn a follower", description: "Gain your first new follower of the day.", target: 1 },
  { code: "outside_reach", title: "Reach new people", description: "Make a post that earns engagement outside your usual audience.", target: 1 },
  { code: "join_trend", title: "Ride the wave", description: "Participate in a trending topic using its hashtag.", target: 1 },
  { code: "reconnect", title: "Reconnect", description: "Reply to someone you've had a good exchange with before.", target: 1 },
];

export async function ensureChallenges(db: Db, player: PlayerRow): Promise<void> {
  const date = todayUtc();
  const existing = await db.from("daily_challenges").select("id", { count: "exact", head: true }).eq("player_id", player.id).eq("challenge_date", date);
  if ((existing.count ?? 0) > 0) return;
  const rng = new Rng(`${player.id}:${date}`);
  const picks = rng.sample(POOL, 3);
  const rows = picks.map((c) => ({ world_id: player.world_id, player_id: player.id, challenge_date: date, code: c.code, title: c.title, description: c.description, target: c.target }));
  const res = await db.from("daily_challenges").insert(rows);
  if (res.error && res.error.code !== "23505") check(res, "insert_challenges");
}

/** Increment today's challenge progress if it exists; complete it and update streaks. */
export async function progressChallenge(db: Db, player: PlayerRow, code: string, amount = 1): Promise<void> {
  const date = todayUtc();
  const ch = check(await db.from("daily_challenges").select("id, progress, target, completed_at, title").eq("player_id", player.id).eq("challenge_date", date).eq("code", code).maybeSingle(), "load_challenge") as { id: string; progress: number; target: number; completed_at: string | null; title: string } | null;
  if (!ch || ch.completed_at) return;
  const progress = Math.min(ch.target, ch.progress + amount);
  const done = progress >= ch.target;
  check(await db.from("daily_challenges").update({ progress, completed_at: done ? new Date().toISOString() : null }).eq("id", ch.id).is("completed_at", null), "update_challenge");
  if (!done) return;
  await notify(db, player.world_id, player.user_id, { type: "achievement", title: `Daily challenge complete: ${ch.title}`, priority: 1 });
  await bumpStreak(db, player, date);
}

async function bumpStreak(db: Db, player: PlayerRow, date: string): Promise<void> {
  const fresh = check(await db.from("player_world_state").select("streak_days, last_streak_date").eq("id", player.id).single(), "load_streak") as { streak_days: number; last_streak_date: string | null };
  if (fresh.last_streak_date === date) return;
  const yesterday = new Date(Date.parse(date) - 86_400_000).toISOString().slice(0, 10);
  // Forgiving: a single missed day keeps half the streak instead of wiping it.
  const twoDaysAgo = new Date(Date.parse(date) - 2 * 86_400_000).toISOString().slice(0, 10);
  const streak = fresh.last_streak_date === yesterday ? fresh.streak_days + 1 : fresh.last_streak_date === twoDaysAgo ? Math.max(1, Math.floor(fresh.streak_days / 2)) + 1 : 1;
  check(await db.from("player_world_state").update({ streak_days: streak, last_streak_date: date }).eq("id", player.id), "update_streak");
  const res = await db.from("streak_history").insert({ world_id: player.world_id, player_id: player.id, streak_date: date, streak_days: streak });
  if (res.error && res.error.code !== "23505") check(res, "insert_streak");
}
