/** Trend lifecycle math. Pure. */
import { clamp } from "./rng.ts";

export type TrendStatus = "emerging" | "rising" | "peak" | "declining" | "ended";

export interface TrendState {
  activity_score: number;
  growth_rate: number;
  decay_rate: number;
  status: TrendStatus;
}

/**
 * Advance a trend by one tick given how many new posts joined it.
 * Fatigue grows with age: the same activity matters less the older a trend is.
 */
export function stepTrend(t: TrendState, newPosts: number, ageTicks: number): TrendState {
  const fatigue = 1 / (1 + ageTicks * 0.08);
  const input = newPosts * 6 * fatigue;
  const decayed = t.activity_score * (1 - t.decay_rate);
  const next = clamp(decayed + input, 0, 1000);
  const growth = t.activity_score > 0 ? (next - t.activity_score) / t.activity_score : next > 0 ? 1 : 0;
  let status: TrendStatus = t.status;
  if (t.status === "ended") return { ...t, activity_score: next, growth_rate: growth };
  if (next < 3 && (t.status === "declining" || ageTicks > 4)) status = "ended";
  else if (growth > 0.15) status = next > 40 ? "rising" : "emerging";
  else if (growth > -0.08 && next > 25) status = "peak";
  else if (growth <= -0.08) status = "declining";
  return { ...t, activity_score: Math.round(next * 10) / 10, growth_rate: Math.round(growth * 100) / 100, status };
}

/** Whether a hashtag has enough momentum to become a trend. */
export function shouldCreateTrend(uniqueAuthors: number, posts: number, population: number): boolean {
  const needed = Math.max(3, Math.round(population * 0.02));
  return uniqueAuthors >= needed && posts >= needed;
}
