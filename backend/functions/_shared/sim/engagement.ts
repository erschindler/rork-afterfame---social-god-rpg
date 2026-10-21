/**
 * Explainable engagement model. For a single candidate account and a post,
 * separate: (1) whether it is noticed, (2) whether it reacts, (3) the type of
 * reaction, (4) the follow/unfollow consequence. Pure and deterministic given an Rng.
 */
import { clamp, Rng } from "./rng.ts";
import type { PostSignals } from "./analyze.ts";
import type { Traits } from "./population.ts";
import type { ReplyStance } from "./text.ts";

export type Via = "follower" | "interest" | "community" | "second_degree" | "trend" | "broad" | "mention";

export interface Candidate {
  id: string;
  archetype: string;
  traits: Traits;
  interests: string[];
  expertise: string[];
  fame: number;
  postsPerDay: number;
  followsAuthor: boolean;
  via: Via;
  /** -100..100 relationship with the author */
  relationship: number;
  hostileMemories: number;
  positiveMemories: number;
  /** Community norms that apply (prefers / dislikes tones). */
  norms?: { prefers?: string[]; dislikes?: string[] };
}

export interface AuthorContext {
  fame: number;
  credibility: number;
  infamy: number;
  nicheTopic?: string | null;
  nicheAuthority: number;
  fatigue: number;
  followerCount: number;
  population: number;
}

export interface Reaction {
  seen: boolean;
  like: boolean;
  repost: boolean;
  reply: ReplyStance | null;
  quote: ReplyStance | null;
  follow: boolean;
  unfollow: boolean;
  approval: number;
  sentiment: number;
  reasons: string[];
}

const STAGE_FACTOR: Record<number, number> = { 1: 1, 2: 0.75, 3: 0.55 };

function normMatch(signals: PostSignals, norms: Candidate["norms"]): number {
  if (!norms) return 0;
  const tone: Record<string, number> = {
    humor: signals.humor, evidence: signals.evidence, earnest: signals.positivity,
    snark: signals.aggression * 0.6 + signals.controversy * 0.4, controversy: signals.controversy,
  };
  let s = 0;
  for (const p of norms.prefers ?? []) s += (tone[p] ?? 0) * 0.25;
  for (const d of norms.dislikes ?? []) s -= (tone[d] ?? 0) * 0.35;
  return s;
}

export function evaluateCandidate(
  c: Candidate,
  signals: PostSignals,
  author: AuthorContext,
  opts: { stage: number; socialProof: number; isPlayerAuthor: boolean },
  rng: Rng,
): Reaction {
  const t = c.traits;
  const reasons: string[] = [];
  const relNorm = clamp(c.relationship / 100, -1, 1);
  const interestMatch = c.interests.includes(signals.topic) ? 1 : 0;
  const expertMatch = c.expertise.includes(signals.topic) ? 1 : 0;
  const viaBonus: Record<Via, number> = { follower: 0.45, mention: 0.7, community: 0.18, trend: 0.18, second_degree: 0.14, interest: 0.05, broad: 0 };

  // 1. Exposure
  const relevance = viaBonus[c.via] + interestMatch * 0.32 + expertMatch * 0.08 + Math.abs(relNorm) * 0.12 + opts.socialProof * 0.1;
  const activity = clamp(c.postsPerDay / 5, 0.15, 1);
  const pSee = clamp(relevance * (0.45 + activity * 0.55) * (1 - author.fatigue * 0.45) * (STAGE_FACTOR[opts.stage] ?? 0.5), 0, 0.95);
  if (!rng.chance(pSee)) {
    return { seen: false, like: false, repost: false, reply: null, quote: null, follow: false, unfollow: false, approval: 0, sentiment: 0, reasons };
  }

  // 2. Approval: how much this personality likes this post from this author
  const humorMatch = signals.humor * (t.humor - 0.3);
  const evidenceMatch = signals.evidence * (t.rigor - 0.2);
  const warmthResponse = signals.positivity * t.warmth * 0.6 - signals.aggression * (t.warmth - t.aggression * 0.6);
  const controversyAppeal = signals.controversy * ((t.contrarian + t.conflict_tolerance) / 2 - t.warmth * 0.4);
  const nicheCred = author.nicheTopic === signals.topic ? author.nicheAuthority / 200 : 0;
  const credFactor = ((author.credibility - 50) / 100) * t.rigor * 0.5 + nicheCred;
  const infamyBias = -(author.infamy / 100) * t.warmth * 0.3 + (author.infamy / 100) * t.contrarian * 0.15;
  const memoryBias = c.positiveMemories * 0.06 - c.hostileMemories * 0.12;
  const approval = clamp(
    signals.quality * 0.45 + humorMatch * 0.6 + evidenceMatch * 0.5 + warmthResponse + controversyAppeal * 0.5 +
      relNorm * 0.35 + opts.socialProof * 0.12 + credFactor + infamyBias + memoryBias + normMatch(signals, c.norms) +
      (c.followsAuthor ? 0.08 : 0) + interestMatch * 0.06 + rng.gaussian(0, 0.12),
    -1,
    1.2,
  );
  const disapproval = clamp(
    signals.controversy * (0.2 + t.contrarian * 0.5) + signals.aggression * (0.3 + t.warmth * 0.4) + Math.max(0, -relNorm) * 0.6 +
      (1 - signals.evidence) * t.rigor * signals.controversy * 0.4 + c.hostileMemories * 0.12 + rng.gaussian(0, 0.08),
    0,
    1.2,
  );

  if (relNorm < -0.2) reasons.push("existing tension with author");
  if (c.positiveMemories > 0) reasons.push("remembers past positive interactions");
  if (c.hostileMemories > 0) reasons.push("remembers past conflict");
  if (interestMatch) reasons.push(`interested in ${signals.topic}`);

  // 3. Reaction types
  const like = approval > 0.3 && approval > disapproval && rng.chance(clamp(0.02 + (approval - 0.2) * 0.45, 0, 0.7));

  let reply: ReplyStance | null = null;
  const pReply = clamp(
    0.015 + t.sociability * 0.05 + (signals.question ? 0.12 : 0) + signals.controversy * t.conflict_tolerance * 0.18 +
      Math.abs(relNorm) * 0.08 + (c.via === "mention" ? 0.35 : 0) + disapproval * 0.06,
    0,
    0.6,
  );
  if (rng.chance(pReply)) {
    if (approval > 0.5 && disapproval < approval * 0.6) {
      const opts2: [ReplyStance, number][] = [
        ["praise", 1 + t.warmth * 2], ["agree_add", 1 + t.rigor * 2], ["relate", t.sociability * 2], ["joke", t.humor * 2],
      ];
      if (opts.socialProof > 0.2 && signals.controversy > 0.3 && t.loyalty > 0.6 && relNorm > 0.1) opts2.push(["defend", 3]);
      if (opts.isPlayerAuthor && c.positiveMemories > 0 && author.fame > 12) opts2.push(["recognize", 2]);
      reply = rng.weighted(opts2, ([, w]) => w)[0];
    } else if (disapproval > 0.28 && disapproval >= approval * 0.7) {
      const opts2: [ReplyStance, number][] = [
        ["disagree", 1 + t.openness], ["critique", t.rigor * 2 + (c.archetype === "critic" ? 2 : 0)],
        ["evidence_request", t.rigor * (1 - signals.evidence) * 3], ["dunk", t.aggression * 2 + (c.archetype === "troll" ? 3 : 0)],
      ];
      reply = rng.weighted(opts2, ([, w]) => w)[0];
    } else {
      const opts2: [ReplyStance, number][] = [
        ["question", t.sociability + 0.5], ["joke", t.humor * 1.5], ["misunderstand", (1 - t.rigor) * 1.2], ["relate", 0.8],
      ];
      reply = rng.weighted(opts2, ([, w]) => w)[0];
    }
  }

  const repost = approval > 0.5 && rng.chance(clamp(0.003 + signals.quality * 0.025 + humorMatch * 0.04 + (approval - 0.5) * 0.06 + t.ambition * opts.socialProof * 0.04, 0, 0.25));

  let quote: ReplyStance | null = null;
  const quoteProne = ["journalist", "critic", "provocateur", "established_creator", "opportunist"].includes(c.archetype) ? 0.03 : 0;
  const pQuote = clamp(0.004 + quoteProne + signals.controversy * t.contrarian * 0.07 + (approval > 0.8 ? 0.02 : 0), 0, 0.2);
  if (rng.chance(pQuote)) {
    quote = disapproval > approval * 0.8 ? (t.aggression > 0.55 ? "dunk" : rng.pick<ReplyStance>(["critique", "disagree"])) : rng.pick<ReplyStance>(["praise", "agree_add", "joke"]);
  }

  // 4. Follow consequences (saturation: harder to grow as share of world rises)
  const saturation = clamp(author.followerCount / Math.max(1, author.population), 0, 0.95);
  let follow = false;
  let unfollow = false;
  if (!c.followsAuthor && approval > 0.45) {
    const pFollow = clamp((0.01 + signals.quality * 0.03 + interestMatch * 0.025 + nicheCred * 0.2 + (repost ? 0.05 : 0) + author.fame / 400) * (1 - saturation), 0, 0.3);
    follow = rng.chance(pFollow);
    if (follow) reasons.push("followed after liking the post");
  }
  if (c.followsAuthor && approval < 0.1) {
    const pUnfollow = clamp(0.03 + author.fatigue * 0.08 + signals.aggression * t.warmth * 0.12 + Math.max(0, -relNorm) * 0.1, 0, 0.35);
    unfollow = rng.chance(pUnfollow);
    if (unfollow) reasons.push(author.fatigue > 0.4 ? "tired of frequent posting" : "put off by the tone");
  }

  const sentiment = clamp(approval - disapproval, -1, 1);
  return { seen: true, like, repost, reply, quote, follow, unfollow, approval, sentiment, reasons };
}

/** Engagement rate used to decide whether a post advances to the next spread stage. */
export function engagementRate(seen: number, likes: number, replies: number, reposts: number, quotes: number): number {
  if (seen <= 0) return 0;
  return (likes + replies * 1.5 + reposts * 3 + quotes * 3) / seen;
}

export function shouldAdvance(stage: number, rate: number, reposts: number, notableAmplified: boolean, rng: Rng): boolean {
  const threshold = stage === 1 ? 0.22 : 0.3;
  const p = clamp((rate - threshold) * 2 + reposts * 0.12 + (notableAmplified ? 0.35 : 0), 0, 0.92);
  return rng.chance(p);
}
