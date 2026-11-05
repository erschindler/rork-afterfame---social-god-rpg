/**
 * Dialogue engine: multi-turn, context-aware conversation between SIM accounts
 * (and between SIMs and players). Every turn is a *dialogue act* chosen from the
 * previous act, the speaker's side relative to the person they answer, their
 * personality and the current "heat" of the exchange. Text is filled from
 * act-specific templates that quote and reference the previous message, then
 * humanized per voice (lowercase, slang, typos, occasional emoji).
 *
 * Pure and deterministic given an Rng. No model required.
 */
import { clamp, Rng } from "./rng.ts";
import { vocabFor } from "./vocab.ts";
import type { Traits } from "./population.ts";
import type { ReplyStance, Voice } from "./text.ts";
import { respond } from "./bank/respond.ts";
import type { UsageLedger } from "./bank/usage.ts";

export type DialogueAct =
  | "agree" | "agree_extend" | "partial_agree" | "counter" | "rebut" | "concede" | "escalate" | "clarify"
  | "receipts" | "evidence_request" | "answer" | "ask_followup" | "joke" | "laugh" | "build_joke" | "pile_on"
  | "defend_op" | "tag_friend" | "friend_arrive" | "mediator" | "exit" | "thank" | "anecdote";

export const DIALOGUE_ACTS: DialogueAct[] = [
  "agree", "agree_extend", "partial_agree", "counter", "rebut", "concede", "escalate", "clarify", "receipts",
  "evidence_request", "answer", "ask_followup", "joke", "laugh", "build_joke", "pile_on", "defend_op", "tag_friend",
  "friend_arrive", "mediator", "exit", "thank", "anecdote",
];

export function isDialogueAct(s: string | null | undefined): s is DialogueAct {
  return !!s && (DIALOGUE_ACTS as string[]).includes(s);
}

/** Speaker's relation to the person they are answering. */
export type Side = "ally" | "opponent" | "neutral";

export interface DialogueContext {
  topic: string;
  /** The message being answered. */
  prevContent: string;
  /** @handle of the person being answered (without @). */
  prevAuthor: string;
  /** @handle of the thread's original poster. */
  opAuthor?: string;
  /** Other people in the conversation (handles, no @), used by mediators. */
  others?: string[];
  /** Handle summoned by tag_friend. */
  friend?: string;
  /** More than two people talking: address replies with @handle. */
  multiParty?: boolean;
  /** Template keys already used in this conversation (avoid repeats). */
  usedKeys?: string[];
  /** Speaker's side toward prevAuthor (selects side-tagged bank entries). */
  side?: Side;
  /** Conversation heat 0..1. */
  heat?: number;
  /** World usage ledger: caps how often a bank entry is reused. */
  usage?: UsageLedger | null;
}

// ---------------------------------------------------------------------------
// Act selection
// ---------------------------------------------------------------------------

type W = [DialogueAct, number][];

/** Base transition weights: previous act -> (side -> next acts). "root" = answering an original post. */
const NEXT: Record<DialogueAct | "root" | "question", Partial<Record<Side, W>>> = {
  root: {
    ally: [["agree", 3], ["agree_extend", 4], ["anecdote", 2.5], ["joke", 1.5], ["ask_followup", 1.5], ["tag_friend", 0.8]],
    opponent: [["counter", 5], ["partial_agree", 3], ["evidence_request", 2], ["joke", 0.8]],
    neutral: [["ask_followup", 3], ["anecdote", 2], ["joke", 2], ["partial_agree", 2], ["agree", 1], ["tag_friend", 0.8]],
  },
  question: {
    ally: [["answer", 8], ["joke", 1], ["anecdote", 1.5]],
    opponent: [["answer", 5], ["counter", 2], ["escalate", 0.6]],
    neutral: [["answer", 7], ["joke", 1]],
  },
  agree: {
    ally: [["thank", 3], ["agree_extend", 2], ["build_joke", 1], ["anecdote", 1]],
    opponent: [["counter", 3], ["pile_on", 1.2], ["evidence_request", 1]],
    neutral: [["ask_followup", 2], ["agree", 1], ["anecdote", 1]],
  },
  agree_extend: {
    ally: [["thank", 2], ["agree", 2.5], ["build_joke", 1], ["anecdote", 1.5], ["ask_followup", 1]],
    opponent: [["counter", 3], ["partial_agree", 2], ["evidence_request", 1.5]],
    neutral: [["ask_followup", 2], ["partial_agree", 1], ["anecdote", 1]],
  },
  partial_agree: {
    ally: [["agree", 2], ["clarify", 1.5]],
    opponent: [["clarify", 3], ["rebut", 2.5], ["concede", 1.5], ["receipts", 1]],
    neutral: [["mediator", 1.5], ["ask_followup", 1.5]],
  },
  counter: {
    ally: [["pile_on", 2], ["agree_extend", 2], ["receipts", 1]],
    opponent: [["rebut", 4], ["clarify", 2.5], ["evidence_request", 1.5], ["concede", 1], ["receipts", 1.5], ["escalate", 0.8]],
    neutral: [["mediator", 2], ["ask_followup", 1.5], ["laugh", 0.8], ["partial_agree", 1.5]],
  },
  rebut: {
    ally: [["pile_on", 1.5], ["agree", 2], ["receipts", 1]],
    opponent: [["rebut", 3], ["escalate", 2], ["concede", 1.2], ["receipts", 1.5], ["evidence_request", 1.2], ["exit", 1]],
    neutral: [["mediator", 2.5], ["laugh", 1], ["ask_followup", 1]],
  },
  escalate: {
    ally: [["pile_on", 2], ["agree", 1]],
    opponent: [["escalate", 2.5], ["exit", 2.5], ["rebut", 1.5], ["concede", 0.6]],
    neutral: [["mediator", 3], ["laugh", 1.5], ["exit", 0.5]],
  },
  clarify: {
    ally: [["agree", 3]],
    opponent: [["concede", 2], ["partial_agree", 2.5], ["rebut", 2], ["evidence_request", 1]],
    neutral: [["agree", 1.5], ["ask_followup", 1]],
  },
  receipts: {
    ally: [["agree", 3], ["thank", 1]],
    opponent: [["concede", 2], ["partial_agree", 2], ["evidence_request", 1.2], ["rebut", 2], ["exit", 1]],
    neutral: [["agree", 1.5], ["ask_followup", 1]],
  },
  evidence_request: {
    ally: [["receipts", 3], ["answer", 2]],
    opponent: [["receipts", 3], ["clarify", 1.5], ["escalate", 1], ["exit", 1]],
    neutral: [["receipts", 2], ["answer", 2]],
  },
  answer: {
    ally: [["thank", 3], ["agree", 1.5], ["ask_followup", 1.5]],
    opponent: [["counter", 2], ["partial_agree", 2], ["thank", 1]],
    neutral: [["thank", 2.5], ["ask_followup", 1.5], ["anecdote", 1]],
  },
  ask_followup: {
    ally: [["answer", 8]],
    opponent: [["answer", 5], ["clarify", 1]],
    neutral: [["answer", 8]],
  },
  joke: {
    ally: [["laugh", 3], ["build_joke", 3]],
    opponent: [["counter", 1.5], ["laugh", 1], ["escalate", 0.6]],
    neutral: [["laugh", 3], ["build_joke", 2]],
  },
  laugh: {
    ally: [["build_joke", 2], ["laugh", 1], ["exit", 1.2]],
    opponent: [["exit", 1], ["counter", 1]],
    neutral: [["build_joke", 1.5], ["laugh", 1], ["exit", 1]],
  },
  build_joke: {
    ally: [["laugh", 3], ["build_joke", 1.5], ["exit", 1]],
    opponent: [["laugh", 1], ["exit", 1]],
    neutral: [["laugh", 2.5], ["build_joke", 1]],
  },
  pile_on: {
    ally: [["laugh", 1], ["agree", 1]],
    opponent: [["escalate", 2], ["exit", 2], ["rebut", 1.5]],
    neutral: [["mediator", 2], ["defend_op", 1.5]],
  },
  defend_op: {
    ally: [["thank", 3], ["agree", 1]],
    opponent: [["rebut", 2], ["escalate", 1.5], ["exit", 1]],
    neutral: [["mediator", 1]],
  },
  tag_friend: {
    ally: [["friend_arrive", 10]],
    neutral: [["friend_arrive", 10]],
    opponent: [["friend_arrive", 10]],
  },
  friend_arrive: {
    ally: [["laugh", 2], ["agree", 2], ["build_joke", 1]],
    opponent: [["counter", 2], ["laugh", 1]],
    neutral: [["laugh", 2], ["agree", 1]],
  },
  mediator: {
    ally: [["thank", 2], ["agree", 2]],
    opponent: [["concede", 2], ["partial_agree", 2], ["rebut", 1.5], ["thank", 1]],
    neutral: [["agree", 2], ["thank", 1.5]],
  },
  exit: { ally: [["laugh", 1]], opponent: [["laugh", 1], ["pile_on", 0.5]], neutral: [["laugh", 1]] },
  thank: { ally: [["agree", 1], ["exit", 2]], opponent: [["exit", 1]], neutral: [["exit", 1], ["agree", 1]] },
  concede: { ally: [["thank", 2], ["agree", 1]], opponent: [["thank", 3], ["agree", 1.5], ["exit", 1]], neutral: [["thank", 1], ["laugh", 1]] },
  anecdote: {
    ally: [["ask_followup", 2], ["anecdote", 1.5], ["agree", 1.5], ["laugh", 1]],
    opponent: [["counter", 1.5], ["partial_agree", 1.5]],
    neutral: [["ask_followup", 2], ["anecdote", 1.5], ["laugh", 1]],
  },
};

function traitMultiplier(act: DialogueAct, t: Traits, heat: number): number {
  switch (act) {
    case "escalate":
    case "pile_on":
      return (0.3 + t.aggression * 1.4 + t.conflict_tolerance * 0.8) * (0.5 + heat);
    case "rebut":
    case "counter":
      return (0.5 + t.conflict_tolerance + t.contrarian * 0.6) * (0.7 + heat * 0.6);
    case "concede":
    case "mediator":
    case "thank":
      return (0.4 + t.warmth + t.openness * 0.6) * (1.2 - heat * 0.5);
    case "joke":
    case "build_joke":
    case "laugh":
      return 0.3 + t.humor * 1.6;
    case "receipts":
    case "evidence_request":
    case "clarify":
      return 0.4 + t.rigor * 1.5;
    case "exit":
      return (0.5 + (1 - t.conflict_tolerance) * 0.8) * (1.4 - heat * 0.6);
    case "tag_friend":
    case "friend_arrive":
    case "anecdote":
    case "ask_followup":
      return 0.4 + t.sociability * 1.2;
    default:
      return 1;
  }
}

export interface ChooseOpts {
  /** The previous message reads as a question directed at the speaker. */
  prevIsQuestion?: boolean;
  /** Whether a friend can be tagged (needs a known friend handle). */
  canTag?: boolean;
  /** Late in a long conversation: prefer wrapping up. */
  turn?: number;
}

export function chooseAct(prev: DialogueAct | null, side: Side, traits: Traits, heat: number, rng: Rng, opts: ChooseOpts = {}): DialogueAct {
  const key: DialogueAct | "root" | "question" = opts.prevIsQuestion && prev !== "tag_friend" ? "question" : prev ?? "root";
  const table = NEXT[key][side] ?? NEXT[key].neutral ?? NEXT.root.neutral!;
  const turn = opts.turn ?? 0;
  const weighted = table
    .filter(([a]) => (a === "tag_friend" ? !!opts.canTag : true))
    .map(([a, w]) => [a, w * traitMultiplier(a, traits, heat) * (a === "exit" ? 1 + turn * 0.12 : 1)] as [DialogueAct, number]);
  if (weighted.length === 0) return side === "opponent" ? "counter" : "agree";
  return rng.weighted(weighted, ([, w]) => w)[0];
}

/** How the temperature of the exchange moves after an act. */
export function nextHeat(heat: number, act: DialogueAct): number {
  const delta: Partial<Record<DialogueAct, number>> = {
    escalate: 0.16, pile_on: 0.1, rebut: 0.05, counter: 0.06, evidence_request: 0.02, receipts: 0,
    concede: -0.35, thank: -0.22, mediator: -0.15, exit: -1, joke: -0.06, laugh: -0.1, build_joke: -0.05,
    agree: -0.08, agree_extend: -0.04, answer: -0.05, clarify: -0.06, tag_friend: 0.04, friend_arrive: 0.02,
  };
  return clamp(heat + (delta[act] ?? 0) - 0.07, 0, 1);
}

/** Acts that naturally end a conversation branch. */
export function isTerminal(act: DialogueAct): boolean {
  return act === "exit";
}

/** Map a distribution reply stance onto a dialogue act so follow-ups can continue from it. */
export function actFromStance(stance: string | null | undefined): DialogueAct | null {
  if (isDialogueAct(stance)) return stance;
  const map: Partial<Record<ReplyStance, DialogueAct>> = {
    praise: "agree", agree_add: "agree_extend", disagree: "counter", critique: "counter", evidence_request: "evidence_request",
    joke: "joke", question: "ask_followup", misunderstand: "counter", defend: "defend_op", dunk: "pile_on",
    recognize: "agree", relate: "anecdote",
  };
  return stance ? map[stance as ReplyStance] ?? null : null;
}

/** Infer what act a free-text (player) message performs, from its analyzed signals. */
export function actFromSignals(s: { question: boolean; aggression: number; positivity: number; apology: boolean; humor: number; evidence: number; controversy?: number }, content: string): DialogueAct {
  const lower = content.toLowerCase();
  if (s.apology) return "concede";
  if (s.aggression >= 0.35) return "escalate";
  if (s.question || content.includes("?")) return /source|proof|evidence|data|citation/.test(lower) ? "evidence_request" : "ask_followup";
  if (s.evidence >= 0.45) return "receipts";
  if (/\b(disagree|wrong|not true|nah|no way|doesn't|isn't|actually)\b/.test(lower)) return "counter";
  if (s.humor >= 0.35) return "joke";
  if (s.positivity >= 0.3 || /\b(agree|exactly|this|facts|so true|yes)\b/.test(lower)) return "agree";
  if (/\b(i|my|me)\b/.test(lower) && content.length > 50) return "anecdote";
  return "agree_extend";
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const T: Record<DialogueAct, string[]> = {
  agree: [
    "yeah this is it exactly",
    "\"{q}\" is the whole thing honestly",
    "Can't argue with that.",
    "agreed. said it better than I would've",
    "This is the correct answer and I'm tired of pretending otherwise.",
    "100%. the {hook} part especially",
    "real. people keep missing this",
    "Yes. Thank you. Finally someone said it.",
    "you're right and the replies know it",
    "facts",
  ],
  agree_extend: [
    "Yes, and it gets worse once you factor in {thing}.",
    "this + the fact that {take_lower}",
    "Agree, and I'd go further: {take_lower}.",
    "exactly. and nobody brings up {noun} in these convos for some reason",
    "Right, and the {hook} part applies to {thing} too.",
    "the {hook} point is underrated. same thing happened with {thing}",
    "Adding: {thing} is the clearest example of this.",
    "and honestly the people loudest about {noun} are the ones who skipped {thing}",
  ],
  partial_agree: [
    "ok fair on the {hook} part but I don't buy the rest",
    "I'm with you halfway. \"{q}\" yes. the conclusion, no.",
    "Partly. {thing} is the exception that breaks this though.",
    "Agree with the premise, not the vibe.",
    "true for {noun}, not so much for {thing}",
    "I'd say 60% right. the other 40% is doing a lot of damage",
    "You're not wrong, but you're also leaving out {thing}.",
  ],
  counter: [
    "I don't think that's right. {thing} kind of proves the opposite.",
    "Respectfully no. \"{q}\" doesn't hold up once you look at {noun}.",
    "Hard disagree. {take}.",
    "counterpoint: {thing}",
    "this only works if you ignore {thing}, which, ok",
    "nah. the {hook} framing is backwards",
    "I used to think this too. Then {thing} happened.",
    "That's one way to read it. The other is that {take_lower}.",
    "idk, feels like you're describing a tiny slice of {topic}",
    "This is a vibe, not an argument.",
  ],
  rebut: [
    "That's not what I said though. I said \"{q}\".",
    "You keep bringing up {thing} like it settles it. It doesn't.",
    "ok but that's a completely different point",
    "Sure, but that's exactly why {take_lower}.",
    "you're arguing with a version of my take that doesn't exist",
    "If that were true, {thing} wouldn't have gone the way it did.",
    "That's an edge case and you know it.",
    "\"{q}\" — and? that doesn't change anything",
    "We're going in circles. {noun} is the whole point.",
    "read it again. slower this time",
  ],
  concede: [
    "ok yeah, that's fair. didn't think about it that way",
    "Fair point. I'll take the L on the {hook} part.",
    "Alright, you've convinced me on that one.",
    "hm. ok. that actually changes things",
    "That's a good point, honestly. Updating my take.",
    "ugh fine. you're right about {thing}",
    "ok I was being stubborn. you're right",
  ],
  escalate: [
    "Not sure why you're being this condescending about it.",
    "imagine typing all that and still being wrong",
    "you clearly didn't read past the first line",
    "Wild that you think this is a gotcha.",
    "ok this is getting embarrassing for you",
    "I'm not doing this with someone who argues in bad faith.",
    "the confidence is impressive. the take is not",
    "Every reply you make is worse than the last.",
  ],
  clarify: [
    "To be clear, I'm not saying {noun} are bad. I'm saying {take_lower}.",
    "Should've worded it better. I meant {thing} specifically, not all of {topic}.",
    "Let me rephrase: \"{q}\" applies when you're starting out, not forever.",
    "fair, that came out wrong. I meant the {hook} part as a general pattern",
    "Not what I meant. I'm talking about {thing}, not {noun} in general.",
    "ok poorly phrased on my part. the point is narrower than it sounds",
  ],
  receipts: [
    "{pct}% of people in the last survey said the same thing. It's not just me.",
    "There's literally data on this. Look at what happened with {thing}.",
    "Pulled the numbers: {num} out of the last {num2} cases went exactly this way.",
    "Not vibes. {thing} is the documented example everyone cites.",
    "here's the thing: {thing} already tested this and it went exactly how I said",
    "Go back and look at {thing}. The pattern is right there.",
  ],
  evidence_request: [
    "Source?",
    "Is there data on this or is it vibes?",
    "Where are you getting \"{q}\" from?",
    "genuinely curious where that's from, haven't seen it",
    "would love to see numbers on the {hook} part",
    "Any examples? Because {thing} doesn't fit that at all.",
    "citation needed lol",
  ],
  answer: [
    "honestly {thing}. it changed how I think about {noun}",
    "For me it's {noun}. {take}.",
    "Short answer: {thing}. Long answer: {take_lower}.",
    "{thing}, no contest",
    "I'd say {noun}. took me way too long to figure that out",
    "Depends, but mostly {thing}. Most people overthink it.",
    "probably {thing}? ask me again in a week",
    "It was {thing}. Before that I was convinced {take_lower}.",
  ],
  ask_followup: [
    "wait, what made you land on that?",
    "Would that apply to {thing} too?",
    "Curious how long it took you to get there?",
    "Genuine question: what would change your mind on this?",
    "so what's your take on {thing} then?",
    "how did {thing} fit into that for you?",
    "Is that from experience or something you read?",
  ],
  joke: [
    "{noun} catching strays in this thread",
    "my therapist is going to hear about \"{q}\"",
    "reading this while literally doing {thing}. called out",
    "not the {hook} slander",
    "this thread is better than anything on my timeline today",
    "i came here to scroll not to be perceived",
    "putting \"{q}\" on a t-shirt",
  ],
  laugh: [
    "lmaooo",
    "\"{q}\" sent me",
    "LMAO",
    "the {hook} part 😭",
    "i'm crying",
    "ok this got me",
    "dead",
    "stop 💀",
  ],
  build_joke: [
    "next you're gonna tell me {thing} is a personality",
    "and then {thing} walked in like nothing happened",
    "the sequel: \"{q}\" part 2",
    "this is how {topic} lore gets written",
    "ok but imagine {thing} reading this thread",
    "adding this to the {topic} hall of fame",
    "screenshotting for the group chat",
  ],
  pile_on: [
    "yeah this one's not it",
    "{prev} really thought they did something here",
    "The replies are unanimous for a reason.",
    "not you doubling down",
    "ratio + {thing} exists",
    "be so serious",
  ],
  defend_op: [
    "People are being way too harsh. {op}'s point stands.",
    "y'all are ignoring the actual argument",
    "{op} has been right about {noun} before. hear them out",
    "This reply section is exhausting. The take is fine.",
    "leave them alone, the post was clearly about {thing}",
  ],
  tag_friend: [
    "{friend} you need to see this",
    "{friend} this is literally what we were talking about",
    "{friend} get in here",
    "{friend} thoughts?",
    "{friend} is gonna have opinions about this",
  ],
  friend_arrive: [
    "I was summoned. and yeah, \"{q}\" is correct",
    "ok I'm here. and I have notes",
    "you rang. this is exactly what I said last week",
    "lmao why did I get tagged in this",
    "Thanks for the tag. Hard agree with {op} here.",
    "I leave for one hour",
  ],
  mediator: [
    "{others} you're both kind of right, just about different things",
    "I think {others} are arguing past each other. one's talking {noun}, the other {thing}.",
    "This is a definitions problem. Agree on what counts as {noun} and the fight disappears.",
    "can we all agree {thing} is the real problem here",
    "Both of you have a point. It depends on {noun}.",
  ],
  exit: [
    "anyway, agree to disagree",
    "I've said my piece. Moving on.",
    "ok I have actual work to do lol",
    "Not spending my evening on this. Have a good one.",
    "muting this thread, my notifications are a mess",
    "we're not getting anywhere. peace",
  ],
  thank: [
    "appreciate this, genuinely",
    "Thanks, that's a really useful way to put it.",
    "ok saving this reply",
    "Thank you! This helps a lot.",
    "this is why I post. thanks",
    "fair. appreciate it",
  ],
  anecdote: [
    "Same thing happened to me with {thing}. Took months to undo.",
    "This was me last year with {thing}. Never again.",
    "funny, I went through the exact opposite with {noun}",
    "I tried this with {thing} and it actually worked, for what it's worth",
    "my whole experience with {thing} in one post",
    "Lived this. {thing} taught me the hard way.",
  ],
};

/** Pull a short verbatim fragment from a message to quote back ("you said X"). */
export function quoteBit(content: string, rng: Rng): string {
  const cleaned = content.replace(/https?:\/\/\S+/g, "").replace(/@\w+/g, "").replace(/#\w+/g, "").replace(/\p{Extended_Pictographic}/gu, "").replace(/\s+/g, " ").trim();
  const clauses = cleaned.split(/[.!?\n;:—]+|,\s/).map((c) => c.trim()).filter((c) => c.split(" ").length >= 2);
  if (clauses.length === 0) return cleaned.slice(0, 40).toLowerCase();
  const clause = rng.pick(clauses);
  const words = clause.split(" ");
  if (words.length <= 7) return clause.replace(/["“”]/g, "").toLowerCase();
  const start = rng.int(0, Math.max(0, words.length - 6));
  return words.slice(start, start + rng.int(4, 6)).join(" ").replace(/["“”]/g, "").toLowerCase();
}

function hookOf(content: string): string {
  const words = content.replace(/https?:\/\/\S+/g, "").replace(/[@#]\w+/g, "").split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, "")).filter(Boolean);
  const stop = new Set(["about", "because", "really", "should", "would", "there", "their", "these", "those", "which", "think", "people", "always", "never", "actually", "everyone", "something", "honestly", "literally"]);
  const c = words.filter((w) => w.length >= 5 && !stop.has(w.toLowerCase()) && !/ly$/i.test(w));
  if (!c.length) return words.slice(0, 2).join(" ").toLowerCase() || "this";
  const longest = c.reduce((a, b) => (b.length > a.length ? b : a));
  return longest.toLowerCase();
}

function fillDialogue(template: string, ctx: DialogueContext, rng: Rng): string {
  const v = vocabFor(ctx.topic);
  const things = rng.sample(v.things, 2);
  let ti = 0;
  const take = rng.pick(v.takes);
  const others = (ctx.others ?? []).filter((o) => o !== ctx.prevAuthor).slice(0, 1);
  const n1 = rng.int(3, 9);
  return template
    .replace(/\{q\}/g, () => quoteBit(ctx.prevContent, rng))
    .replace(/\{hook\}/g, () => hookOf(ctx.prevContent))
    .replace(/\{take\}/g, take.charAt(0).toUpperCase() + take.slice(1))
    .replace(/\{take_lower\}/g, take)
    .replace(/\{noun\}/g, () => rng.pick(v.nouns))
    .replace(/\{thing\}/g, () => things[ti++ % things.length])
    .replace(/\{topic\}/g, v.name)
    .replace(/\{prev\}/g, `@${ctx.prevAuthor}`)
    .replace(/\{op\}/g, ctx.opAuthor ? `@${ctx.opAuthor}` : "OP")
    .replace(/\{friend\}/g, ctx.friend ? `@${ctx.friend}` : "")
    .replace(/\{others\}/g, [`@${ctx.prevAuthor}`, ...others.map((o) => `@${o}`)].join(" and "))
    .replace(/\{pct\}/g, String(rng.int(38, 81)))
    .replace(/\{num2\}/g, String(n1 + rng.int(1, 6)))
    .replace(/\{num\}/g, String(n1));
}

const SLANG_TAILS = [" ngl", " tbh", " fr", " lol", " imo", " honestly"];

function typo(word: string, rng: Rng): string {
  if (word.length < 5 || !/^[a-z]+$/.test(word)) return word;
  const i = rng.int(1, word.length - 3);
  return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
}

/** Make generated text read like a person typed it, per voice. */
export function humanize(text: string, voice: Voice, rng: Rng): string {
  let out = text.trim();
  const style = voice.style;
  const lowerish = style === "casual" || style === "terse" || style === "deadpan" || (style === "snarky" && rng.chance(0.6)) || (style === "hype" && rng.chance(0.3));
  if (lowerish && !/[A-Z]{3,}/.test(out)) out = out.charAt(0).toLowerCase() + out.slice(1);
  if (style === "terse" || style === "deadpan") {
    out = out.replace(/[.]$/, "");
    if (style === "terse" && out.length > 70) out = out.split(/(?<=[.!?])\s/)[0].replace(/[.]$/, "");
    out = out.toLowerCase();
  }
  if (style === "casual") {
    if (rng.chance(0.5)) out = out.replace(/[.]$/, "");
    if (rng.chance(0.18) && out.length < 200) out = out.replace(/[.!]?$/, "") + rng.pick(SLANG_TAILS);
    if (rng.chance(0.12)) out = out.replace(/\byou\b/g, "u").replace(/\bare\b/g, "r");
    if (rng.chance(0.07)) {
      const words = out.split(" ");
      const idx = rng.int(0, words.length - 1);
      words[idx] = typo(words[idx], rng);
      out = words.join(" ");
    }
  }
  if (style === "snarky" && rng.chance(0.3)) out = out.replace(/[.]$/, "");
  if (style === "hype") {
    if (rng.chance(0.35)) out = out.replace(/[.]?$/, "!");
    if (rng.chance(0.12)) out += rng.pick([" 🔥", " 🙌", "!!"]);
  }
  if ((style === "casual" || voice.humor === "absurd") && rng.chance(0.05) && !/[\u{1F300}-\u{1FAFF}]/u.test(out)) out += rng.pick([" 💀", " 😭", " 😅"]);
  if (style === "formal" || style === "academic" || style === "earnest") {
    out = out.charAt(0).toUpperCase() + out.slice(1);
    if (!/[.!?"”)]$/.test(out) && !/\p{Extended_Pictographic}$/u.test(out)) out += ".";
  }
  return out.replace(/\s+/g, " ").trim();
}

export interface DialogueLine {
  text: string;
  key: string;
}

/** Generate the text for a dialogue act answering ctx.prevContent. */
export function generateDialogue(act: DialogueAct, ctx: DialogueContext, voice: Voice, rng: Rng): DialogueLine {
  const used = new Set(ctx.usedKeys ?? []);
  const effAct: DialogueAct = act === "tag_friend" && !ctx.friend ? "ask_followup" : act;
  // 1) Response bank (triggered on the message being answered), 2) the classic
  // templates while fresh ones remain, 3) on-the-fly composition.
  const bankCtx = { topic: ctx.topic, text: ctx.prevContent, prev: ctx.prevAuthor, op: ctx.opAuthor, friend: ctx.friend, others: ctx.others };
  const req = { act: effAct, ctx: bankCtx, style: voice.style, side: ctx.side, heat: ctx.heat, usage: ctx.usage };
  const fromBank = rng.chance(0.85) ? respond(req, rng.fork("bank"), { allowCompose: false }) : null;
  let raw: string;
  let key: string;
  if (fromBank && !used.has(fromBank.id)) {
    raw = fromBank.text;
    key = fromBank.id;
  } else {
    const pool = T[effAct];
    const fresh = pool.map((_, i) => i).filter((i) => !used.has(`${effAct}:${i}`));
    if (fresh.length) {
      const idx = rng.pick(fresh);
      raw = fillDialogue(pool[idx], ctx, rng);
      key = `${effAct}:${idx}`;
    } else {
      const c = respond(req, rng.fork("compose"))!;
      raw = c.text;
      key = c.id;
    }
  }
  let text = humanize(raw, voice, rng);
  // In crowded threads people address who they're answering.
  const addressed = text.includes(`@${ctx.prevAuthor}`);
  if (ctx.multiParty && !addressed && !["tag_friend", "mediator", "laugh"].includes(act) && rng.chance(0.45)) text = `@${ctx.prevAuthor} ${text}`;
  return { text: text.slice(0, 280), key };
}

// ---------------------------------------------------------------------------
// Conversation planning helpers
// ---------------------------------------------------------------------------

export type Team = "pro" | "con" | "neutral";

export interface Participant {
  id: string;
  username: string;
  team: Team;
  exited?: boolean;
}

export function sideBetween(speaker: Team, target: Team): Side {
  if (speaker === "neutral" || target === "neutral") return "neutral";
  return speaker === target ? "ally" : "opponent";
}

/** Team a newcomer joins, from their traits and their relationship to the OP. */
export function pickTeam(traits: Traits, relToOp: number, rng: Rng): Team {
  const con = 0.2 + traits.contrarian * 0.6 + traits.conflict_tolerance * 0.2 - relToOp / 120;
  const pro = 0.3 + traits.warmth * 0.4 + traits.loyalty * 0.2 + relToOp / 120;
  const neu = 0.3 + traits.openness * 0.3 + traits.humor * 0.2;
  return rng.weighted<Team>(["pro", "con", "neutral"], (t) => (t === "pro" ? pro : t === "con" ? con : neu));
}

/** Delay before the next turn: hot exchanges are fast, cool ones slow. */
export function turnDelayMs(heat: number, act: DialogueAct, rng: Rng): number {
  const base = act === "laugh" || act === "pile_on" ? 12_000 : 25_000;
  const spread = (1.2 - heat) * 140_000;
  return Math.round(base + rng.range(0, spread));
}
