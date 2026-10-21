/** Explainable, capped reputation formulas and rank logic. Pure. */
import { clamp, round1 } from "./rng.ts";
import { FAME_RANKS, NOTORIETY_RANKS } from "./config.ts";
import type { PostSignals } from "./analyze.ts";

export type Attribute =
  | "fame" | "admiration" | "infamy" | "credibility" | "influence" | "controversy"
  | "audience_loyalty" | "niche_authority" | "connection_strength" | "fatigue";

export interface PlayerAttrs {
  fame: number;
  admiration: number;
  infamy: number;
  credibility: number;
  influence: number;
  controversy: number;
  audience_loyalty: number;
  niche_authority: number;
  connection_strength: number;
  fatigue: number;
}

export interface AttrDelta {
  attribute: Attribute;
  delta: number;
  reason: string;
}

export interface StageOutcome {
  stage: number;
  seen: number;
  outsideSeen: number;
  likes: number;
  supportive: number;
  critical: number;
  reposts: number;
  quotesPositive: number;
  quotesNegative: number;
  newFollowers: number;
  lostFollowers: number;
  notableAmplifier: string | null;
  expertApprovals: number;
  expertCritiques: number;
  population: number;
  signals: PostSignals;
  isNicheTopic: boolean;
}

/** Diminishing returns: gains shrink as a value approaches 100, losses shrink near 0. */
export function damp(current: number, delta: number): number {
  if (delta >= 0) return delta * Math.pow((100 - current) / 100, 1.15);
  return delta * Math.pow(Math.max(current, 1) / 100, 0.6);
}

export function stageDeltas(o: StageOutcome, s: PlayerAttrs): AttrDelta[] {
  const out: AttrDelta[] = [];
  const push = (attribute: Attribute, raw: number, cap: number, reason: string) => {
    const capped = clamp(raw, -cap, cap);
    const d = round1(damp(s[attribute], capped));
    if (Math.abs(d) >= 0.1) out.push({ attribute, delta: d, reason });
  };
  const pop = Math.max(1, o.population);

  // Fame: breadth of recognition, especially outside the existing audience.
  const reachShare = o.outsideSeen / pop;
  const fameRaw = reachShare * 28 + (o.notableAmplifier ? 2.5 : 0) + (o.newFollowers / pop) * 40 + o.reposts * 0.15;
  if (fameRaw > 0.05) {
    const why = o.notableAmplifier
      ? `Post was amplified by @${o.notableAmplifier}`
      : o.outsideSeen > 0
        ? `Post reached ${o.outsideSeen} accounts outside your audience`
        : "Post reached your followers";
    push("fame", fameRaw, 6, why);
  }

  // Admiration: positive sentiment and respect.
  const admRaw = o.supportive * 0.6 + o.likes * 0.08 + o.quotesPositive * 0.8 - o.critical * 0.7 - o.quotesNegative * 1.1 + o.signals.positivity * 0.5;
  if (Math.abs(admRaw) > 0.15) {
    push("admiration", admRaw, 4, admRaw > 0 ? `${o.supportive + o.quotesPositive} supportive responses` : `${o.critical + o.quotesNegative} critical responses`);
  }

  // Credibility: reliability as judged by rigorous accounts.
  const credRaw = o.expertApprovals * 0.7 - o.expertCritiques * 1.1 + (o.signals.evidence > 0.4 ? 0.4 : 0) - (o.signals.controversy > 0.5 && o.signals.evidence < 0.2 ? 0.6 : 0);
  if (Math.abs(credRaw) > 0.15) {
    push("credibility", credRaw, 4, credRaw > 0 ? "Knowledgeable accounts backed your post" : "Knowledgeable accounts questioned your claims");
  }

  // Infamy: notoriety from hostile behaviour drawing negative attention.
  const negAttention = o.critical + o.quotesNegative * 2;
  if (o.signals.aggression > 0.35 && negAttention > 0) {
    push("infamy", o.signals.aggression * 2 + negAttention * 0.5 + reachShare * 6, 5, "Hostile tone drew public backlash");
  }

  // Controversy: split reactions.
  const split = Math.min(o.supportive + o.quotesPositive + o.likes * 0.1, o.critical + o.quotesNegative);
  const contRaw = split * 0.9 + o.signals.controversy * (o.seen / pop) * 6;
  if (contRaw > 0.2) push("controversy", contRaw, 5, split >= 2 ? "Audience split sharply on your post" : "Polarizing framing drew attention");

  // Loyalty: followers sticking around vs leaving.
  const loyRaw = o.newFollowers * 0.15 - o.lostFollowers * 0.8;
  if (Math.abs(loyRaw) > 0.1) push("audience_loyalty", loyRaw, 3, loyRaw > 0 ? "New followers joined" : `${o.lostFollowers} followers left`);

  // Niche authority grows only when posting within your niche.
  if (o.isNicheTopic && (o.expertApprovals > 0 || o.supportive > 0)) {
    push("niche_authority", o.expertApprovals * 0.8 + o.supportive * 0.25 + o.signals.evidence, 3, `Recognized for ${o.signals.topic} contributions`);
  }

  return out;
}

/** Influence is derived: smoothly moves toward a target built from other attributes. */
export function influenceTarget(s: PlayerAttrs, followerShare: number): number {
  return clamp(s.fame * 0.42 + s.credibility * 0.18 + s.connection_strength * 0.15 + s.audience_loyalty * 0.08 + s.niche_authority * 0.1 + followerShare * 40 - s.infamy * 0.12, 0, 100);
}

/** Per-tick passive change: decay of heat, recovery of trust, fading of inactive fame. */
export function decayDeltas(s: PlayerAttrs, ticks: number, opts: { hoursSinceLastPost: number; recentCredibilityLoss: boolean }): AttrDelta[] {
  const out: AttrDelta[] = [];
  const add = (attribute: Attribute, delta: number, reason: string) => {
    const d = round1(delta);
    if (Math.abs(d) >= 0.1) out.push({ attribute, delta: d, reason });
  };
  if (s.infamy > 0) add("infamy", -Math.min(s.infamy, 0.12 * ticks * (0.5 + s.infamy / 100)), "Notoriety fading with time");
  if (s.controversy > 0) add("controversy", -Math.min(s.controversy, 0.3 * ticks), "Debate cooled down");
  if (s.fatigue > 0) add("fatigue", -Math.min(s.fatigue, 0.05 * ticks), "Audience rested");
  if (opts.hoursSinceLastPost > 24 && s.fame > 2) add("fame", -Math.min(s.fame * 0.05, 0.04 * ticks), "Fading from attention while inactive");
  if (s.credibility < 50 && !opts.recentCredibilityLoss) add("credibility", Math.min(50 - s.credibility, 0.1 * ticks), "Trust slowly recovering");
  return out;
}

export interface RankRequirement {
  label: string;
  current: number;
  target: number;
  met: boolean;
}

export interface RankInfo {
  rank: string;
  index: number;
  next: string | null;
  requirements: RankRequirement[];
  progress: number;
}

export interface RankInput {
  fame: number;
  influence: number;
  followers: number;
  outsideReach: number;
  viralPosts: number;
  population: number;
}

function meets(r: (typeof FAME_RANKS)[number], i: RankInput): boolean {
  return i.fame >= r.minFame && i.followers >= Math.ceil(r.minFollowerShare * i.population) && i.influence >= r.minInfluence &&
    i.outsideReach >= Math.ceil(r.minReachShare * i.population) && i.viralPosts >= r.minViral;
}

/** Ranks need several conditions at once, so follower count alone never reaches the top. */
export function computeRank(i: RankInput): RankInfo {
  let index = 0;
  for (let k = 1; k < FAME_RANKS.length; k++) {
    if (meets(FAME_RANKS[k], i)) index = k;
    else break;
  }
  const nextDef = FAME_RANKS[index + 1];
  if (!nextDef) return { rank: FAME_RANKS[index].name, index, next: null, requirements: [], progress: 1 };
  const reqs: RankRequirement[] = [
    { label: "Fame", current: round1(i.fame), target: nextDef.minFame, met: i.fame >= nextDef.minFame },
    { label: "Followers", current: i.followers, target: Math.ceil(nextDef.minFollowerShare * i.population), met: i.followers >= Math.ceil(nextDef.minFollowerShare * i.population) },
    { label: "Reach outside audience", current: i.outsideReach, target: Math.ceil(nextDef.minReachShare * i.population), met: i.outsideReach >= Math.ceil(nextDef.minReachShare * i.population) },
  ];
  if (nextDef.minInfluence > 0) reqs.push({ label: "Influence", current: round1(i.influence), target: nextDef.minInfluence, met: i.influence >= nextDef.minInfluence });
  if (nextDef.minViral > 0) reqs.push({ label: "Viral posts", current: i.viralPosts, target: nextDef.minViral, met: i.viralPosts >= nextDef.minViral });
  const progress = reqs.reduce((a, r) => a + clamp(r.target === 0 ? 1 : r.current / r.target, 0, 1), 0) / reqs.length;
  return { rank: FAME_RANKS[index].name, index, next: nextDef.name, requirements: reqs.filter((r) => r.target > 0), progress: round1(progress * 100) / 100 };
}

export function computeNotoriety(infamy: number): string {
  let name = NOTORIETY_RANKS[0].name;
  for (const r of NOTORIETY_RANKS) if (infamy >= r.minInfamy) name = r.name;
  return name;
}

export interface CareerStats {
  posts: number;
  humorPosts: number;
  evidencePosts: number;
  controversialPosts: number;
  questionPosts: number;
  replies: number;
  trendsStarted: number;
  positivePosts: number;
  topicsUsed: number;
  nicheAuthority: number;
  fame: number;
  infamy: number;
}

/** Infer emerging identities from sustained behaviour. Descriptive, never restrictive. */
export function inferCareer(c: CareerStats): string[] {
  if (c.posts < 3) return [];
  const share = (n: number) => n / Math.max(1, c.posts);
  const ids: [string, number][] = [
    ["Entertainer", share(c.humorPosts)],
    ["Expert", share(c.evidencePosts) * 0.7 + c.nicheAuthority / 100],
    ["Provocateur", share(c.controversialPosts) + c.infamy / 200],
    ["Community Leader", c.replies / Math.max(1, c.posts + c.replies) * 0.8 + share(c.positivePosts) * 0.4],
    ["Commentator", share(c.questionPosts) * 0.5 + (c.topicsUsed >= 4 ? 0.3 : 0)],
    ["Trendsetter", c.trendsStarted * 0.35],
    ["Mystery Account", c.posts < 8 && c.fame > 25 ? 0.6 : 0],
  ];
  return ids.filter(([, s]) => s >= 0.3).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n);
}
