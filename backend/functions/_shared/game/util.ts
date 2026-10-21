import { check, type Db } from "../http.ts";
import type { Voice } from "../sim/text.ts";
import type { SimRow } from "./types.ts";
import type { CommStyle, HumorStyle } from "../sim/population.ts";

export async function insertBatched(db: Db, table: string, rows: Record<string, unknown>[], size = 500): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    check(await db.from(table).insert(rows.slice(i, i + size), { defaultToNull: false }), `batch_insert_${table}`);
  }
}

export function voiceOf(sim: Pick<SimRow, "communication_style" | "humor_style" | "personality_traits">): Voice {
  return { style: sim.communication_style as CommStyle, humor: sim.humor_style as HumorStyle, traits: sim.personality_traits };
}

export function isoMinutesAgo(minutes: number, from = Date.now()): string {
  return new Date(from - minutes * 60_000).toISOString();
}

/** Abstract engagement for a sim's post from its (mostly unsimulated) audience. */
export function abstractEngagement(followers: number, quality: number, r: () => number): { likes: number; replies: number; reposts: number; views: number } {
  const views = Math.round(followers * (0.08 + r() * 0.25));
  const rate = 0.01 + quality * 0.05 + r() * 0.03;
  const likes = Math.round(views * rate);
  return { likes, replies: Math.round(likes * (0.05 + r() * 0.12)), reposts: Math.round(likes * (0.03 + r() * 0.1)), views };
}

export function todayUtc(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function countRows(db: Db, table: string, filters: Record<string, string>): Promise<number> {
  let q = db.from(table).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const res = await q;
  check(res, `count_${table}`);
  return res.count ?? 0;
}
