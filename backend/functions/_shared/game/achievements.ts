/** Server-validated achievements. Clients can never grant these. */
import { check, type Db } from "../http.ts";
import type { PlayerRow, WorldRow } from "./types.ts";
import { notify, population } from "./store.ts";

export interface AchievementHints {
  viralPost?: boolean;
  lowEffortViral?: boolean;
  notableMention?: boolean;
  divisivePost?: boolean;
  feud?: boolean;
  collab?: boolean;
  trendStarted?: boolean;
  sourcePostId?: string | null;
  sourceEventId?: string | null;
}

let catalog: Map<string, { id: string; name: string; description: string }> | null = null;

async function loadCatalog(db: Db) {
  if (catalog) return catalog;
  const rows = check(await db.from("achievements").select("id, code, name, description").eq("is_active", true), "load_achievements") as { id: string; code: string; name: string; description: string }[];
  catalog = new Map(rows.map((r) => [r.code, { id: r.id, name: r.name, description: r.description }]));
  return catalog;
}

export async function evaluateAchievements(db: Db, world: WorldRow, player: PlayerRow, hints: AchievementHints = {}): Promise<string[]> {
  const cat = await loadCatalog(db);
  const owned = check(await db.from("player_achievements").select("achievement_id").eq("player_id", player.id), "load_owned") as { achievement_id: string }[];
  const ownedIds = new Set(owned.map((o) => o.achievement_id));
  const has = (code: string) => {
    const a = cat.get(code);
    return !a || ownedIds.has(a.id);
  };
  const unlock: string[] = [];
  const pop = population(world);

  if (!has("first_post") && player.post_count >= 1) unlock.push("first_post");
  if (!has("first_follower")) {
    const res = await db.from("follows").select("id", { count: "exact", head: true }).eq("followed_player_id", player.id).eq("reason", "organic");
    if ((res.count ?? 0) >= 1) unlock.push("first_follower");
  }
  if (!has("followers_100") && player.follower_count >= Math.min(100, Math.round(pop * 0.5))) unlock.push("followers_100");
  if (!has("first_viral") && (hints.viralPost || player.viral_posts >= 1)) unlock.push("first_viral");
  if (!has("accidental_celebrity") && hints.viralPost && hints.lowEffortViral) unlock.push("accidental_celebrity");
  if (!has("creator_mention") && hints.notableMention) unlock.push("creator_mention");
  if (!has("most_divisive") && hints.divisivePost) unlock.push("most_divisive");
  if (!has("first_feud") && hints.feud) unlock.push("first_feud");
  if (!has("first_collab") && hints.collab) unlock.push("first_collab");
  if (!has("first_trend") && hints.trendStarted) unlock.push("first_trend");
  if (!has("credibility_75") && player.credibility >= 75) unlock.push("credibility_75");
  if (!has("niche_authority") && player.niche_authority >= 40) unlock.push("niche_authority");
  if (!has("internet_legend") && player.current_rank === "Legend") unlock.push("internet_legend");
  if (!has("community_milestone")) {
    const res = await db.from("community_memberships").select("id", { count: "exact", head: true }).eq("player_id", player.id).gte("standing", 10);
    if ((res.count ?? 0) > 0) unlock.push("community_milestone");
  }
  if (!has("reputation_recovery") && player.credibility >= 20) {
    const low = check(await db.from("reputation_history").select("new_value").eq("player_id", player.id).eq("attribute_name", "credibility").lt("delta", 0).order("new_value").limit(1), "rep_low") as { new_value: number }[];
    if (low.length && player.credibility - low[0].new_value >= 10) unlock.push("reputation_recovery");
  }
  if (!has("comeback_story")) {
    const ev = check(await db.from("world_events").select("id, event_data").eq("world_id", world.id).eq("involves_player", true).in("event_type", ["public_backlash", "public_feud"]).order("started_at").limit(1), "comeback_ev") as { id: string; event_data: { admiration_at?: number } }[];
    if (ev.length && typeof ev[0].event_data?.admiration_at === "number" && player.admiration >= ev[0].event_data.admiration_at + 8 && player.fame >= 10) unlock.push("comeback_story");
  }

  const granted: string[] = [];
  for (const code of unlock) {
    const a = cat.get(code)!;
    const res = await db.from("player_achievements").insert({
      world_id: world.id, user_id: player.user_id, player_id: player.id, achievement_id: a.id,
      source_post_id: hints.sourcePostId ?? null, source_event_id: hints.sourceEventId ?? null,
    });
    if (res.error) {
      if (res.error.code === "23505") continue;
      check(res, "grant_achievement");
    }
    granted.push(code);
    await notify(db, world.id, player.user_id, { type: "achievement", title: `Achievement unlocked: ${a.name}`, body: a.description, sourceType: "achievement", sourceId: a.id, priority: 2 });
  }
  return granted;
}
