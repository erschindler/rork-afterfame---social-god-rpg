/**
 * Lift reusable phrases out of a message: a short verbatim quote, a single
 * hook word, and an "echo" noun phrase ("what are you making?" -> null,
 * "I'm learning to bake sourdough" -> "baking sourdough"-ish phrases).
 */
import type { Rng } from "../rng.ts";

const clean = (s: string) =>
  s.replace(/https?:\/\/\S+/g, "").replace(/@\w+/g, "").replace(/#\w+/g, "").replace(/\p{Extended_Pictographic}/gu, "").replace(/\s+/g, " ").trim();

export function quoteOf(content: string, rng: Rng): string {
  const cleaned = clean(content);
  const clauses = cleaned.split(/(?<!\d)[.!?](?!\d)|[\n;:—]+|,\s/).map((c) => c.trim()).filter((c) => c.split(" ").length >= 2);
  if (!clauses.length) return cleaned.slice(0, 40).toLowerCase();
  const words = rng.pick(clauses).split(" ");
  if (words.length <= 7) return words.join(" ").replace(/["“”]/g, "").toLowerCase();
  const start = rng.int(0, Math.max(0, words.length - 6));
  return words.slice(start, start + rng.int(4, 6)).join(" ").replace(/["“”]/g, "").toLowerCase();
}

const STOP = new Set([
  "about", "because", "really", "should", "would", "there", "their", "these", "those", "which", "think", "people", "always", "never",
  "actually", "everyone", "something", "honestly", "literally", "anyone", "anything", "nothing", "today", "lately", "thing", "things",
]);

export function hookWord(content: string): string {
  const words = clean(content).split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, "")).filter(Boolean);
  const c = words.filter((w) => w.length >= 5 && !STOP.has(w.toLowerCase()) && !/ly$/i.test(w));
  if (!c.length) return words.slice(0, 2).join(" ").toLowerCase() || "this";
  return c.reduce((a, b) => (b.length > a.length ? b : a)).toLowerCase();
}

const PRONOUN_ONLY = /^(this|that|it|them|me|you|stuff|things?|everything|anything|something|lately|today|now|here|there|so|too|much|yet)$/;
const LEAD = /\b(?:about|into|on|with|playing|doing|working on|making|watching|reading|learning|building|trying|started|starting|finished|love|loving|hate|obsessed with|addicted to)\s+((?:the |a |an |my |some )?[a-z0-9'-]+(?: [a-z0-9'-]+){0,3})/;

/** A noun phrase from the message worth echoing back, or null if none is clear. */
export function echoOf(content: string): string | null {
  const t = clean(content).toLowerCase().replace(/[?!.,;:]+/g, " ").replace(/\s+/g, " ").trim();
  const m = t.match(LEAD);
  let phrase = m?.[1] ?? null;
  if (phrase) {
    phrase = phrase.replace(/\b(lately|today|now|recently|again|too|tbh|lol|honestly|right now|this week|rn)\b.*$/, "").trim();
    phrase = phrase.replace(/^(the|a|an|some) /, "");
    // "learning to bake bread" -> "baking bread"
    phrase = phrase.replace(/^to ([a-z]+)/, (_m, v: string) => ing(v));
    if (!phrase || PRONOUN_ONLY.test(phrase) || phrase.split(" ").every((w) => PRONOUN_ONLY.test(w))) phrase = null;
  }
  if (phrase) return phrase.replace(/^my /, "your ");
  // Fall back to the strongest single content word if it is a real noun-ish word.
  const hw = hookWord(content);
  return hw.length >= 5 && !hw.includes(" ") && !/(ed|ly)$/.test(hw) ? hw : null;
}

/** "grow their own audience" -> "growing my audience" */
export function goalPhrase(goal: string | null | undefined): string | null {
  if (!goal) return null;
  const words = goal.replace(/\btheir own\b/g, "my").replace(/\btheir\b/g, "my").split(" ");
  return [ing(words[0]), ...words.slice(1)].join(" ");
}

export function ing(v: string): string {
  if (/ing$/.test(v)) return v;
  if (/ie$/.test(v)) return v.slice(0, -2) + "ying";
  if (/[^aeiou]e$/.test(v)) return v.slice(0, -1) + "ing";
  if (/^(win|run|stop|plan|swim|shop|get|sit|put|chat|jog|begin)$/.test(v)) return v + v.at(-1) + "ing";
  return v + "ing";
}
