/** Polls: SIM-authored poll content and how simulated audiences vote. */
import { hashString, Rng } from "./rng.ts";
import { vocabFor } from "./vocab.ts";

export interface Poll {
  options: string[];
  counts: number[];
  closes_at: string;
}

const QUESTIONS = [
  "Settle this once and for all:",
  "Be honest. Which one?",
  "Quick poll for {topic} people",
  "Which of these would you actually pick?",
  "Need the timeline to decide this for me",
  "Unpopular opinion check:",
  "Ranking time. Pick one",
  "Genuinely curious what you all think",
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A poll a SIM might post about a topic. */
export function simPoll(topic: string, rng: Rng): { question: string; options: string[] } {
  const v = vocabFor(topic);
  const pool = [...new Set([...v.things, ...v.nouns])].filter((x) => x.length <= 40);
  const n = rng.chance(0.55) ? 2 : rng.chance(0.6) ? 3 : 4;
  const options = rng.sample(pool, n).map(cap);
  while (options.length < 2) options.push(options.length ? "Neither" : "Yes");
  return { question: rng.pick(QUESTIONS).replace("{topic}", v.name), options };
}

/** Deterministic per-poll appeal of each option (the "true" audience preference). */
export function optionWeights(pollKey: string, n: number): number[] {
  const r = new Rng(hashString(`poll:${pollKey}`));
  return Array.from({ length: n }, () => 0.4 + r.next() * 1.8);
}

/** One voter's choice: shared appeal plus personal noise. */
export function pickOption(weights: number[], rng: Rng, contrarian = 0): number {
  const max = Math.max(...weights);
  // Contrarians lean toward the less popular choice.
  const w = weights.map((x) => Math.max(0.05, (contrarian > 0.6 ? max - x + 0.3 : x) * (0.6 + rng.next() * 0.8)));
  return rng.weighted(w.map((_, i) => i), (i) => w[i]);
}

/** Spread `votes` abstract votes across options. */
export function distributeVotes(weights: number[], votes: number, rng: Rng): number[] {
  const counts = weights.map(() => 0);
  for (let i = 0; i < votes; i++) counts[pickOption(weights, rng)]++;
  return counts;
}

export function isClosed(poll: Poll | null | undefined, now = Date.now()): boolean {
  return !!poll && Date.parse(poll.closes_at) <= now;
}
