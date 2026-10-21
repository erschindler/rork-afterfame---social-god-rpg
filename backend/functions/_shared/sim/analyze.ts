/** Heuristic, explainable analysis of a post's content. No model required. */
import { clamp } from "./rng.ts";
import { VOCAB } from "./vocab.ts";

export interface PostSignals {
  topic: string;
  humor: number;
  aggression: number;
  evidence: number;
  question: boolean;
  positivity: number;
  controversy: number;
  apology: boolean;
  correction: boolean;
  quality: number;
  novelty: number;
  mentions: string[];
  hashtags: string[];
  lowEffort: boolean;
}

const HUMOR = ["lol", "lmao", "haha", "joke", "me:", "nobody:", "pov", "unhinged", "cursed", "💀", "😭", "😂"];
const AGGRESSION = ["idiot", "stupid", "trash", "garbage", "clown", "pathetic", "worst", "shut up", "embarrassing", "loser", "dumb", "moron", "fraud", "grifter"];
const CONTROVERSY = ["hot take", "unpopular opinion", "overrated", "fight me", "controversial", "i'll say it", "nobody wants to admit", "hill to die on", "is dead", "is a scam", "cancel"];
const POSITIVE = ["love", "great", "amazing", "thanks", "thank you", "proud", "congrats", "grateful", "beautiful", "wholesome", "shoutout", "appreciate", "helpful"];
const EVIDENCE = ["data", "study", "source", "according to", "research", "numbers", "percent", "%", "survey", "paper", "measured", "benchmark", "chart"];
const APOLOGY = ["i'm sorry", "im sorry", "i apologize", "my apologies", "i was wrong", "that's on me", "i messed up"];
const CORRECTION = ["correction", "update:", "i was wrong", "to clarify", "i misspoke", "retracting"];

const countHits = (text: string, list: string[]): number => list.reduce((n, w) => (text.includes(w) ? n + 1 : n), 0);

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2));
}

/** Jaccard similarity between two strings' word sets. */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Infer the most likely topic from keywords; falls back to the provided default. */
export function inferTopic(content: string, fallback: string): string {
  const text = ` ${content.toLowerCase()} `;
  let best = fallback;
  let bestScore = 0;
  for (const [topic, v] of Object.entries(VOCAB)) {
    let score = 0;
    for (const k of v.keywords) if (text.includes(k.length <= 3 ? ` ${k} ` : k)) score += 1;
    for (const tag of v.tags) if (text.includes(tag.toLowerCase())) score += 3;
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }
  return best;
}

export function analyzePost(content: string, opts: { topic?: string | null; fallbackTopic: string; recentOwnPosts: string[] }): PostSignals {
  const lower = content.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const len = content.length;
  const mentions = Array.from(new Set((content.match(/@([a-z0-9_]{2,24})/gi) ?? []).map((m) => m.slice(1).toLowerCase())));
  const hashtags = Array.from(new Set((content.match(/#([A-Za-z][A-Za-z0-9_]{1,30})/g) ?? []).map((h) => h)));
  const capsRatio = (content.match(/[A-Z]/g)?.length ?? 0) / Math.max(1, content.match(/[A-Za-z]/g)?.length ?? 1);
  const exclam = (content.match(/!/g) ?? []).length;

  const humor = clamp(countHits(lower, HUMOR) * 0.35, 0, 1);
  const aggression = clamp(countHits(lower, AGGRESSION) * 0.4 + (capsRatio > 0.6 && len > 15 ? 0.3 : 0) + (exclam > 3 ? 0.15 : 0), 0, 1);
  const controversy = clamp(countHits(lower, CONTROVERSY) * 0.45 + aggression * 0.4, 0, 1);
  const positivity = clamp(countHits(lower, POSITIVE) * 0.3, 0, 1);
  const evidence = clamp(countHits(lower, EVIDENCE) * 0.3 + (/\d/.test(content) ? 0.2 : 0) + (/https?:\/\//.test(content) ? 0.3 : 0), 0, 1);

  let maxSim = 0;
  for (const p of opts.recentOwnPosts) maxSim = Math.max(maxSim, similarity(content, p));
  const novelty = clamp(1 - maxSim * 1.3, 0, 1);

  // Quality: readable length, sentence structure, specificity, not shouting, not repetitive.
  const lengthScore = len < 20 ? 0.25 : len < 50 ? 0.55 : len < 220 ? 0.85 : 0.7;
  // Vocabulary variety, weighted by length so one-word posts don't look "specific".
  const specificity = clamp(new Set(words).size / Math.max(1, words.length), 0, 1) * Math.min(1, words.length / 10);
  const quality = clamp(
    lengthScore * 0.45 + specificity * 0.25 + evidence * 0.15 + humor * 0.1 + novelty * 0.1 - (capsRatio > 0.6 ? 0.25 : 0) - aggression * 0.25,
    0.05,
    1,
  );

  const topic = opts.topic && VOCAB[opts.topic] ? opts.topic : inferTopic(content, opts.fallbackTopic);

  return {
    topic,
    humor,
    aggression,
    evidence,
    question: content.trim().endsWith("?"),
    positivity,
    controversy,
    apology: countHits(lower, APOLOGY) > 0,
    correction: countHits(lower, CORRECTION) > 0,
    quality: Math.round(quality * 100) / 100,
    novelty: Math.round(novelty * 100) / 100,
    mentions,
    hashtags,
    lowEffort: len < 25 && evidence < 0.2,
  };
}
