/**
 * Response bank: thousands of grammar lines that expand to millions of
 * distinct responses, indexed by act and trigger for fast lookup.
 *
 * Lookup: detect triggers in the message once, take the act's bucket, keep
 * entries whose trigger/side/style/heat tags fit, weight by specificity and
 * by how rarely the world has used them, expand one. If every candidate is
 * exhausted, `compose()` writes a fresh context-built answer instead.
 */
import { hashString, type Rng } from "../rng.ts";
import { vocabFor } from "../vocab.ts";
import type { CommStyle } from "../population.ts";
import { compile, countNodes, countVariants, expand, slotsOf, tidy } from "./grammar.ts";
import { applyMacros } from "./macros.ts";
import { detectTriggers, type Trigger } from "./triggers.ts";
import { echoOf, goalPhrase, hookWord, quoteOf } from "./extract.ts";
import { CAP_GENERIC, CAP_TRIGGERED, type UsageLedger } from "./usage.ts";
import { REPLIES_A } from "./entries/replies-a.ts";
import { REPLIES_B } from "./entries/replies-b.ts";
import { DM } from "./entries/dm.ts";
import { POSTS } from "./entries/posts.ts";

export { detectTriggers, questionKind, type Trigger } from "./triggers.ts";
export { UsageLedger } from "./usage.ts";
export { echoOf, goalPhrase, hookWord, quoteOf } from "./extract.ts";

export type BankSide = "ally" | "opponent" | "neutral";

export interface Entry {
  id: string;
  act: string;
  src: string;
  triggers: Trigger[];
  sides: BankSide[];
  styles: string[];
  hot: boolean;
  slots: string[];
}

export interface BankContext {
  /** Topic key used for <thing>, <noun>, <take>, <news>, <tag>. */
  topic: string;
  /** The message being answered (source of <q>, <hook>, <echo>). */
  text?: string;
  prev?: string;
  op?: string;
  friend?: string;
  others?: string[];
  /** Player handle in DMs (no @). */
  name?: string;
  /** The speaker's own interest and goal (DMs). */
  myTopic?: string;
  myGoal?: string;
  hook?: string | null;
  memory?: string | null;
  tag?: string;
}

export interface BankRequest {
  act: string;
  ctx: BankContext;
  style?: CommStyle | string;
  side?: BankSide;
  heat?: number;
  usage?: UsageLedger | null;
  /** Precomputed triggers for ctx.text (saves a pass when reused). */
  triggers?: Set<Trigger>;
  /** Apply the per-style opener/tail decorations (default true). */
  decorate?: boolean;
}

export interface BankLine {
  text: string;
  id: string;
  triggered: boolean;
}

const TAG = /^([@^~%])([a-z_]+)$/;

function parseLine(act: string, raw: string): Entry {
  const parts = raw.split(" ");
  const triggers: Trigger[] = [];
  const sides: BankSide[] = [];
  const styles: string[] = [];
  let hot = false;
  let i = 0;
  for (; i < parts.length; i++) {
    const m = parts[i].match(TAG);
    if (!m) break;
    if (m[1] === "@") triggers.push(m[2] as Trigger);
    else if (m[1] === "^") sides.push(m[2] as BankSide);
    else if (m[1] === "~") styles.push(m[2]);
    else if (m[1] === "%" && m[2] === "hot") hot = true;
  }
  let rest = parts.slice(i).join(" ");
  if (rest.startsWith(":: ")) rest = rest.slice(3);
  const src = applyMacros(rest);
  compile(src);
  return { id: `${act}.${hashString(act + "|" + raw).toString(36)}`, act, src, triggers, sides, styles, hot, slots: slotsOf(src) };
}

// --- index (built lazily, once per isolate) --------------------------------

let byAct: Map<string, Entry[]> | null = null;
let byTrigger: Map<string, Entry[]> | null = null;

function build() {
  byAct = new Map();
  byTrigger = new Map();
  for (const group of [REPLIES_A, REPLIES_B, DM, POSTS]) {
    for (const [act, lines] of Object.entries(group)) {
      const list = byAct.get(act) ?? [];
      for (const l of lines) {
        const e = parseLine(act, l);
        list.push(e);
        for (const t of e.triggers) {
          const k = `${act}|${t}`;
          const b = byTrigger.get(k) ?? [];
          b.push(e);
          byTrigger.set(k, b);
        }
      }
      byAct.set(act, list);
    }
  }
}

function index() {
  if (!byAct) build();
  return { byAct: byAct!, byTrigger: byTrigger! };
}

export function bankActs(): string[] {
  return [...index().byAct.keys()];
}

// --- style decorations ------------------------------------------------------

const DECOR: Record<string, { open: string; tail: string; pOpen: number; pTail: number }> = {
  casual: { open: "{ok so|honestly|lowkey|not gonna lie|okay but}", tail: "{ngl|tbh|lol|fr|imo|honestly|lmao|tho}", pOpen: 0.22, pTail: 0.2 },
  terse: { open: "{eh|hm}", tail: "{.|}", pOpen: 0.05, pTail: 0 },
  snarky: { open: "{sure|ok but|cool so|imagine|wow|right, so}", tail: "{I guess|apparently|anyway|but go off|sure}", pOpen: 0.2, pTail: 0.15 },
  earnest: { open: "{Honestly|Genuinely|For what it's worth|I have to say}", tail: "{, truly|. Just my two cents}", pOpen: 0.18, pTail: 0.1 },
  academic: { open: "{Worth noting:|To be precise,|Small point:|Strictly speaking,|For context,}", tail: "{, for what it's worth|, broadly speaking|, at least in the literature}", pOpen: 0.2, pTail: 0.1 },
  hype: { open: "{YES|ok wait|BRO|LETS GO|yo}", tail: "{!!|!!!| fr| no cap}", pOpen: 0.2, pTail: 0.3 },
  deadpan: { open: "{so|well|anyway}", tail: "{. great| I guess|. cool}", pOpen: 0.1, pTail: 0.1 },
  formal: { open: "{Respectfully,|In my view,|To be fair,}", tail: "{. Thank you|. Best regards}", pOpen: 0.1, pTail: 0.04 },
};

function decorate(text: string, style: string | undefined, rng: Rng): string {
  const d = style ? DECOR[style] : undefined;
  if (!d) return text;
  let out = text;
  const startsWithOpener = /^(honestly|ok|okay|so|wait|lol|lmao|yes|yeah|yep|no|nah|oh|ooh|hey|hi|yo|hm+|sure|right|well|genuinely|ngl|tbh|not gonna lie|real talk|i really think|respectfully|for real)\b/i.test(out);
  const firstClause = out.split(/[.,!?]/)[0].trim().split(/\s+/).length;
  if (!/^[@"“<]/.test(out) && !startsWithOpener && firstClause > 3 && !out.trim().endsWith("?") && rng.chance(d.pOpen)) {
    const o = expand(d.open, rng, () => "") ?? "";
    if (o) out = `${o}${/[,:]$/.test(o) ? "" : ","} ${out.charAt(0).toLowerCase()}${out.slice(1)}`;
  }
  if (out.length < 200 && !out.trim().endsWith("?") && rng.chance(d.pTail)) {
    const t = expand(d.tail, rng, () => "") ?? "";
    if (t) out = /^[.,!]/.test(t) ? out.replace(/[.!?]*$/, "") + t : out.replace(/[.]$/, "") + " " + t;
  }
  return out;
}

// --- slots ------------------------------------------------------------------

const FOODS = ["pizza", "ramen", "tacos", "cold brew", "instant noodles", "a gas station sandwich", "cereal for dinner", "sourdough", "dumplings", "leftover curry", "an entire rotisserie chicken", "iced coffee"];

export function slotFn(ctx: BankContext, rng: Rng): (name: string) => string | null {
  const v = vocabFor(ctx.topic);
  const mine = vocabFor(ctx.myTopic ?? ctx.topic);
  const [t1, t2] = rng.sample(v.things, 2);
  const text = ctx.text ?? "";
  let echo: string | null | undefined;
  return (name) => {
    switch (name) {
      case "q": return text ? quoteOf(text, rng) : null;
      case "hook": {
        if (ctx.hook) return ctx.hook;
        if (!text) return rng.pick(v.nouns);
        const h = hookWord(text);
        return h.length >= 4 && !/^(lol|lmao|haha|hahaha|this|that)$/.test(h) ? h : null;
      }
      case "echo":
        if (echo === undefined) echo = text ? echoOf(text) : null;
        return echo;
      case "thing": return t1;
      case "thing2": return t2 ?? t1;
      case "noun": return rng.pick(v.nouns);
      case "topic": return v.name;
      case "take": return rng.pick(v.takes);
      case "take_cap": { const t = rng.pick(v.takes); return t.charAt(0).toUpperCase() + t.slice(1); }
      case "news": return rng.pick(v.news);
      case "tag": return ctx.tag ?? rng.pick(v.tags);
      case "prev": return ctx.prev ? `@${ctx.prev}` : null;
      case "op": return ctx.op ? `@${ctx.op}` : null;
      case "friend": return ctx.friend ? `@${ctx.friend}` : null;
      case "others": return ctx.prev ? [ctx.prev, ...(ctx.others ?? []).filter((o) => o !== ctx.prev).slice(0, 1)].map((o) => `@${o}`).join(" and ") : null;
      case "name": return ctx.name ? `@${ctx.name}` : null;
      case "my_thing": return rng.pick(mine.things);
      case "my_topic": return mine.name;
      case "my_goal": return goalPhrase(ctx.myGoal) ?? `getting better at ${mine.name}`;
      case "memory": return ctx.memory ?? null;
      case "food": return rng.pick(FOODS);
      case "num": return String(rng.int(3, 9));
      case "num2": return String(rng.int(10, 20));
      case "pct": return String(rng.int(38, 81));
      case "year": return String(rng.int(2009, 2023));
      default: return null;
    }
  };
}

// --- lookup -----------------------------------------------------------------

function eligible(e: Entry, req: BankRequest, tr: Set<Trigger>): number {
  let matched = 0;
  if (e.triggers.length) {
    for (const t of e.triggers) if (tr.has(t)) matched++;
    if (!matched) return 0;
  }
  if (e.sides.length && !e.sides.includes(req.side ?? "neutral")) return 0;
  if (e.styles.length && (!req.style || !e.styles.includes(req.style))) return 0;
  if (e.hot && (req.heat ?? 0) < 0.5) return 0;
  if ((e.slots.includes("friend") && !req.ctx.friend) || (e.slots.includes("op") && !req.ctx.op) || (e.slots.includes("prev") && !req.ctx.prev)) return 0;
  if (e.slots.includes("memory") && !req.ctx.memory) return 0;
  if ((e.slots.includes("q") || e.slots.includes("echo")) && !req.ctx.text) return 0;
  const used = req.usage?.count(e.id) ?? 0;
  const cap = e.triggers.length ? CAP_TRIGGERED : CAP_GENERIC;
  if (used >= cap) return 0;
  let w = 1 + Math.min(2, matched) * 2.5 + (e.styles.length ? 1.5 : 0) + (e.sides.length ? 0.5 : 0);
  w /= 1 + used;
  return w;
}

/** Pick and expand a bank line for an act. Null when nothing fresh fits. */
export function pickLine(req: BankRequest, rng: Rng): BankLine | null {
  const { byAct } = index();
  const bucket = byAct.get(req.act);
  if (!bucket?.length) return null;
  const tr = req.triggers ?? (req.ctx.text ? detectTriggers(req.ctx.text) : new Set<Trigger>());
  let cands = bucket.map((e) => ({ e, w: eligible(e, req, tr) })).filter((c) => c.w > 0);
  if (!cands.length) return null;
  // Context-specific entries win most of the time when any exist.
  if (cands.some((c) => c.e.triggers.length)) cands = cands.map((c) => (c.e.triggers.length ? c : { e: c.e, w: c.w * 0.06 }));
  const slot = slotFn(req.ctx, rng);
  for (let attempt = 0; attempt < 6 && cands.length; attempt++) {
    const pick = rng.weighted(cands, (c) => c.w);
    let text = expand(pick.e.src, rng, slot);
    if (text && req.decorate !== false) text = decorate(text, req.style, rng);
    if (text) text = tidy(text);
    if (!text || (req.usage && req.usage.seenText(text))) {
      cands = cands.filter((c) => c !== pick);
      continue;
    }
    req.usage?.record(pick.e.id, text);
    return { text, id: pick.e.id, triggered: pick.e.triggers.length > 0 };
  }
  return null;
}

/** Pool size per slot for one topic (message-derived slots count as 1). */
function slotPool(name: string, v: ReturnType<typeof vocabFor>): number {
  switch (name) {
    case "thing": case "my_thing": return v.things.length;
    case "thing2": return Math.max(1, v.things.length - 1);
    case "noun": return v.nouns.length;
    case "take": case "take_cap": return v.takes.length;
    case "news": return v.news.length;
    case "tag": return v.tags.length;
    case "food": return FOODS.length;
    case "num": return 7;
    case "num2": return 11;
    case "pct": return 44;
    case "year": return 15;
    default: return 1;
  }
}

/**
 * Bank size, counted honestly:
 * - templates: distinct surface forms of the grammar alone (slots unfilled)
 * - filled: distinct texts once vocabulary slots are filled, summed over every topic
 * - voiced: filled x the average number of per-style opener/tail decorations
 * Message-derived slots (quotes, echoes) are counted as 1, so real variety is higher.
 */
export function bankStats(topics: string[] = []): { acts: number; lines: number; templates: number; filled: number; voiced: number } {
  const { byAct } = index();
  const vocabs = (topics.length ? topics : ["gaming"]).map((t) => vocabFor(t));
  let lines = 0;
  let templates = 0;
  let filled = 0;
  for (const list of byAct.values()) {
    for (const e of list) {
      lines++;
      const n = countVariants(e.src);
      templates += n;
      for (const v of vocabs) filled += n * e.slots.reduce((m, s) => m * slotPool(s, v), 1);
    }
  }
  const decor = Object.values(DECOR);
  const avg = decor.reduce((s, d) => s + (1 + countNodes(compile(d.open))) * (1 + countNodes(compile(d.tail))), 0) / decor.length;
  return { acts: byAct.size, lines, templates, filled, voiced: Math.round(filled * avg) };
}
