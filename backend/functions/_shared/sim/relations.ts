/** Relationship scoring and lifecycle helpers. Pure. */
import { clamp } from "./rng.ts";

export type RelationshipStatus =
  | "acquaintance" | "supporter" | "friend" | "collaborator" | "mentor" | "rival" | "critic" | "former_ally" | "public_enemy";

export const INTERACTION_DELTA: Record<string, number> = {
  like: 1.2,
  repost: 3,
  praise: 3.5,
  agree_add: 2.5,
  relate: 2,
  joke: 0.8,
  question: 0.8,
  recognize: 3,
  defend: 6,
  misunderstand: -0.8,
  disagree: -2,
  evidence_request: -1,
  critique: -4,
  dunk: -6,
  quote_positive: 4,
  quote_negative: -6,
  follow: 2,
  unfollow: -4,
  player_reply_thoughtful: 3,
  player_reply_hostile: -7,
  player_mention_positive: 4,
  player_mention_hostile: -9,
  collab: 15,
  collab_declined: -3,
  apology: 6,
};

export function applyDelta(score: number, delta: number): number {
  // Strong relationships move slower (inertia), but never freeze.
  const inertia = 1 - Math.abs(score) / 180;
  return clamp(Math.round((score + delta * inertia) * 10) / 10, -100, 100);
}

export function statusFor(score: number, peak: number, hostileCount: number, collabs = 0): RelationshipStatus {
  if (peak >= 30 && score <= 0) return "former_ally";
  if (score <= -45 && hostileCount >= 3) return "public_enemy";
  if (score <= -25) return hostileCount >= 2 ? "rival" : "critic";
  if (score <= -10) return "critic";
  if (collabs > 0 && score >= 30) return "collaborator";
  if (score >= 40) return "friend";
  if (score >= 12) return "supporter";
  return "acquaintance";
}

export function describeChange(name: string, delta: number, reason: string): string {
  if (delta > 0) return `Your relationship with ${name} improved: ${reason}.`;
  return `${name} became more critical of you: ${reason}.`;
}
