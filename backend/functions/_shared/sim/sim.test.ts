/**
 * Unit tests for the pure simulation engine.
 * Run: cd backend/functions && deno test _shared/sim/
 */
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Rng } from "./rng.ts";
import { generatePopulation, type Traits } from "./population.ts";
import { analyzePost } from "./analyze.ts";
import { type Candidate, engagementRate, evaluateCandidate, shouldAdvance } from "./engagement.ts";
import { computeRank, damp, decayDeltas, type PlayerAttrs, stageDeltas } from "./reputation.ts";
import { stepTrend } from "./trends.ts";
import { generateReply } from "./text.ts";
import { applyDelta, statusFor } from "./relations.ts";

const neutral: Traits = { warmth: 0.5, aggression: 0.2, rigor: 0.5, humor: 0.5, ambition: 0.5, sociability: 0.5, conflict_tolerance: 0.5, risk_tolerance: 0.5, loyalty: 0.5, openness: 0.5, contrarian: 0.3 };
const attrs: PlayerAttrs = { fame: 10, admiration: 50, infamy: 0, credibility: 50, influence: 5, controversy: 0, audience_loyalty: 40, niche_authority: 0, connection_strength: 0, fatigue: 0 };
const author = { fame: 5, credibility: 50, infamy: 0, nicheTopic: null, nicheAuthority: 0, fatigue: 0, followerCount: 5, population: 100 };

function candidate(id: string, over: Partial<Candidate> = {}): Candidate {
  return { id, archetype: "casual", traits: neutral, interests: ["gaming"], expertise: [], fame: 5, postsPerDay: 3, followsAuthor: false, via: "interest", relationship: 0, hostileMemories: 0, positiveMemories: 0, ...over };
}

Deno.test("rng is deterministic for the same seed", () => {
  const a = new Rng("seed-1");
  const b = new Rng("seed-1");
  for (let i = 0; i < 20; i++) assertEquals(a.next(), b.next());
  assertNotEquals(new Rng("seed-1").next(), new Rng("seed-2").next());
});

Deno.test("population is deterministic, sized, and has unique usernames", () => {
  const p1 = generatePopulation(42, "gaming", 100);
  const p2 = generatePopulation(42, "gaming", 100);
  assertEquals(p1.length, 100);
  assertEquals(p1.map((p) => p.username), p2.map((p) => p.username));
  assertEquals(new Set(p1.map((p) => p.username)).size, 100);
  const celebs = p1.filter((p) => p.fame > 60).length;
  assert(celebs < 15, "most accounts should not be famous");
});

Deno.test("personality traits stay consistent for a seeded account", () => {
  const a = generatePopulation(7, "mixed", 20)[5];
  const b = generatePopulation(7, "mixed", 20)[5];
  assertEquals(a.personality_traits, b.personality_traits);
  assertEquals(a.communication_style, b.communication_style);
});

Deno.test("a post can receive zero engagement", () => {
  const signals = analyzePost("ok", { fallbackTopic: "gaming", recentOwnPosts: [] });
  let zeroRuns = 0;
  for (let run = 0; run < 20; run++) {
    const rng = new Rng(`zero-${run}`);
    let engaged = 0;
    for (let i = 0; i < 20; i++) {
      const r = evaluateCandidate(candidate(`c${i}`, { via: "broad", interests: ["music"] }), signals, author, { stage: 1, socialProof: 0, isPlayerAuthor: true }, rng.fork(i));
      if (r.like || r.reply || r.repost || r.quote) engaged++;
    }
    if (engaged === 0) zeroRuns++;
  }
  assert(zeroRuns > 0, "some runs should produce no engagement at all");
});

Deno.test("a strong post can advance toward viral spread", () => {
  const signals = analyzePost("Shipped my indie game after 14 months. Honest numbers: 212 wishlists became 1,900 after one devlog. Data and chart inside.", { fallbackTopic: "indiedev", recentOwnPosts: [] });
  const rng = new Rng("viral");
  let likes = 0, reposts = 0, seen = 0;
  for (let i = 0; i < 80; i++) {
    const r = evaluateCandidate(candidate(`v${i}`, { interests: ["indiedev"], followsAuthor: i < 30, via: i < 30 ? "follower" : "interest", relationship: 30, traits: { ...neutral, warmth: 0.8, rigor: 0.7 } }), signals, author, { stage: 1, socialProof: 0.3, isPlayerAuthor: true }, rng.fork(i));
    if (r.seen) seen++;
    if (r.like) likes++;
    if (r.repost) reposts++;
  }
  const rate = engagementRate(seen, likes, 0, reposts, 0);
  let advanced = 0;
  for (let k = 0; k < 20; k++) if (shouldAdvance(1, rate, reposts, false, new Rng(`adv${k}`))) advanced++;
  assert(advanced > 0, `expected advancement, rate=${rate}`);
});

Deno.test("hostile memories reduce approval (memory influences reactions)", () => {
  const signals = analyzePost("Here is my honest take on roguelikes and why they work.", { fallbackTopic: "gaming", recentOwnPosts: [] });
  let calm = 0, grudge = 0;
  for (let i = 0; i < 200; i++) {
    calm += evaluateCandidate(candidate("m", { via: "mention" }), signals, author, { stage: 1, socialProof: 0, isPlayerAuthor: true }, new Rng(`m${i}`)).approval;
    grudge += evaluateCandidate(candidate("m", { via: "mention", hostileMemories: 3, relationship: -40 }), signals, author, { stage: 1, socialProof: 0, isPlayerAuthor: true }, new Rng(`m${i}`)).approval;
  }
  assert(grudge < calm);
});

Deno.test("trolls dunk more than warm fans on controversial posts", () => {
  const signals = analyzePost("Unpopular opinion: speedrun categories with no glitches are trash. Fight me.", { fallbackTopic: "speedrunning", recentOwnPosts: [] });
  const troll: Traits = { ...neutral, aggression: 0.9, warmth: 0.1, contrarian: 0.9, conflict_tolerance: 0.95 };
  const fan: Traits = { ...neutral, aggression: 0.05, warmth: 0.95, contrarian: 0.1, loyalty: 0.9 };
  let trollNeg = 0, fanNeg = 0;
  for (let i = 0; i < 400; i++) {
    const t = evaluateCandidate(candidate("t", { archetype: "troll", traits: troll, via: "follower", followsAuthor: true }), signals, author, { stage: 1, socialProof: 0.2, isPlayerAuthor: true }, new Rng(`t${i}`));
    const f = evaluateCandidate(candidate("f", { archetype: "fan", traits: fan, via: "follower", followsAuthor: true }), signals, author, { stage: 1, socialProof: 0.2, isPlayerAuthor: true }, new Rng(`t${i}`));
    if (t.reply === "dunk" || t.reply === "critique" || t.quote === "dunk") trollNeg++;
    if (f.reply === "dunk" || f.quote === "dunk") fanNeg++;
  }
  assert(trollNeg > fanNeg);
});

Deno.test("controversy can raise fame while lowering admiration", () => {
  const signals = analyzePost("Hot take: this whole community is embarrassing and full of clowns.", { fallbackTopic: "gaming", recentOwnPosts: [] });
  const deltas = stageDeltas({ stage: 1, seen: 60, outsideSeen: 45, likes: 4, supportive: 2, critical: 9, reposts: 1, quotesPositive: 0, quotesNegative: 3, newFollowers: 2, lostFollowers: 1, notableAmplifier: null, expertApprovals: 0, expertCritiques: 2, population: 100, signals, isNicheTopic: false }, attrs);
  const get = (a: string) => deltas.filter((d) => d.attribute === a).reduce((s, d) => s + d.delta, 0);
  assert(get("fame") > 0, "fame should rise");
  assert(get("admiration") < 0, "admiration should fall");
  assert(get("infamy") > 0, "infamy should rise");
});

Deno.test("credibility recovers over time when no recent losses", () => {
  const d = decayDeltas({ ...attrs, credibility: 30 }, 10, { hoursSinceLastPost: 2, recentCredibilityLoss: false });
  assert(d.some((x) => x.attribute === "credibility" && x.delta > 0));
  const none = decayDeltas({ ...attrs, credibility: 30 }, 10, { hoursSinceLastPost: 2, recentCredibilityLoss: true });
  assert(!none.some((x) => x.attribute === "credibility"));
});

Deno.test("diminishing returns shrink gains near the cap", () => {
  assert(damp(90, 5) < damp(10, 5));
  assert(damp(5, -5) > -5);
});

Deno.test("rank needs multiple conditions, not just followers", () => {
  const followersOnly = computeRank({ fame: 2, influence: 0, followers: 90, outsideReach: 0, viralPosts: 0, population: 100 });
  assertEquals(followersOnly.rank, "Nobody");
  const balanced = computeRank({ fame: 25, influence: 15, followers: 10, outsideReach: 40, viralPosts: 0, population: 100 });
  assertEquals(balanced.rank, "Rising Name");
});

Deno.test("trends rise with activity and decay without it", () => {
  let t = { activity_score: 10, growth_rate: 0, decay_rate: 0.15, status: "emerging" as const };
  let s = stepTrend(t, 8, 1);
  assert(s.activity_score > t.activity_score);
  for (let i = 0; i < 30; i++) s = stepTrend(s, 0, 2 + i);
  assertEquals(s.status, "ended");
  void t;
  t = { ...t };
});

Deno.test("generated replies are varied", () => {
  const rng = new Rng("variety");
  const voice = { style: "casual" as const, humor: "dry" as const, traits: neutral };
  const out = new Set<string>();
  for (let i = 0; i < 60; i++) out.add(generateReply(rng.pick(["praise", "disagree", "joke", "question", "agree_add"] as const), { topic: rng.pick(["gaming", "tech", "music"]), hook: "the patch notes" }, voice, rng.fork(i)));
  assert(out.size > 40, `only ${out.size} unique replies`);
});

Deno.test("relationship status follows score history", () => {
  assertEquals(statusFor(50, 50, 0), "friend");
  assertEquals(statusFor(-30, 0, 2), "rival");
  assertEquals(statusFor(-5, 40, 1), "former_ally");
  assert(applyDelta(95, 10) <= 100);
});
