/**
 * Direct-message engine. Classifies what the player is doing in a DM and writes
 * a SIM reply that reflects the relationship, the SIM's personality, what it
 * remembers about the player and what was already said in the thread.
 * Also writes SIM-initiated openers (fans, allies, rivals, reporters, brands).
 */
import { clamp, Rng } from "./rng.ts";
import { vocabFor } from "./vocab.ts";
import { humanize } from "./dialogue.ts";
import type { Voice } from "./text.ts";
import { respond } from "./bank/respond.ts";
import { type BankContext, detectTriggers } from "./bank/index.ts";
import type { UsageLedger } from "./bank/usage.ts";

export type DmIntent =
  | "greeting" | "smalltalk" | "question" | "compliment" | "hostile" | "collab_ask" | "apology" | "thanks" | "laugh" | "advice_ask" | "other";

export function classifyDm(text: string): DmIntent {
  const t = text.toLowerCase().trim();
  if (/\b(idiot|stupid|trash|clown|loser|pathetic|shut up|fraud|grifter|hate you|moron)\b/.test(t)) return "hostile";
  if (/\b(sorry|apologi[sz]e|my bad|i was wrong|out of line)\b/.test(t)) return "apology";
  if (/\b(collab|work together|team up|podcast|feature|partner|stream together|guest)\b/.test(t)) return "collab_ask";
  if (/\b(advice|tips?|any recs|recommend|what should i|how do i)\b/.test(t)) return "advice_ask";
  if (/\b(thank|thanks|thx|ty|appreciate)\b/.test(t)) return "thanks";
  if (/\b(love your|big fan|huge fan|your posts|you're great|ur great|inspir|amazing|so good)\b/.test(t)) return "compliment";
  if (/^(lol|lmao|haha|hah|lmfao|😂|💀|😭)/.test(t)) return "laugh";
  if (/\b(how are you|how's it going|hows it going|what's up|whats up|wyd|how you doing)\b/.test(t)) return "smalltalk";
  if (/^(hey|hi|hello|yo|sup|hiya|heya|howdy)\b/.test(t) && t.length < 40) return "greeting";
  if (t.includes("?")) return "question";
  return "other";
}

export interface DmReplyInput {
  intent: DmIntent;
  playerText: string;
  playerUsername: string;
  simArchetype: string;
  topic: string;
  voice: Voice;
  /** Relationship score -100..100 (sim's view of player). */
  relationship: number;
  simFame: number;
  playerFame: number;
  /** Number of messages already in the thread. */
  historyCount: number;
  /** The SIM already said hi in this thread. */
  simGreeted: boolean;
  /** A memory the SIM holds about the player, e.g. "boosted my post". */
  memory?: string | null;
  /** Hook from the player's most recent post, for "saw your post about X". */
  recentPostHook?: string | null;
  /** Last SIM message texts (to avoid repeats). */
  recentSimTexts?: string[];
  /** The SIM's most recent message (to detect "player answered my question"). */
  lastSimText?: string | null;
  /** The player's previous message before this burst (repeat detection). */
  prevPlayerText?: string | null;
  /** SIM's own first goal, e.g. "grow their own audience". */
  simGoal?: string | null;
  /** World usage ledger for bank entries. */
  usage?: UsageLedger | null;
}

export interface DmReplyOutput {
  /** Empty means the SIM left the player on "Seen". */
  messages: string[];
  seenOnly: boolean;
  /** SIM is open to a collaboration (caller creates the invite). */
  collab: boolean;
  /** Relationship nudge from this exchange. */
  relDelta: number;
  /** Bank entry ids used. */
  sources: string[];
}

export function sideOf(rel: number): "ally" | "neutral" | "opponent" {
  return rel >= 15 ? "ally" : rel <= -15 ? "opponent" : "neutral";
}

const EMOTIONAL = ["win", "sad", "fail", "tired", "hot_take", "agreeing", "disagreeing", "pets", "food", "work"] as const;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Decide and write the SIM's reply. Pure; deterministic given rng. */
export function dmReply(input: DmReplyInput, rng: Rng): DmReplyOutput {
  const rel = input.relationship;
  const gap = input.simFame - input.playerFame;
  // Big accounts leave strangers on Seen.
  const seenChance = clamp((gap - 15) / 60 - rel / 80 + (input.intent === "hostile" ? 0.25 : 0) + (input.historyCount > 14 ? 0.15 : 0), 0, 0.85);
  if (rng.chance(seenChance)) return { messages: [], seenOnly: true, collab: false, relDelta: 0, sources: [] };

  const side = sideOf(rel);
  const triggers = detectTriggers(input.playerText);
  const ctx: BankContext = {
    topic: input.topic, text: input.playerText, name: input.playerUsername, myTopic: input.topic, myGoal: input.simGoal ?? undefined,
    hook: input.recentPostHook ?? null, memory: input.memory ?? null,
  };
  const recent = new Set((input.recentSimTexts ?? []).map(norm));
  const sources: string[] = [];
  const say = (act: string, allowCompose = true): string | null => {
    for (let i = 0; i < 3; i++) {
      const r = respond({ act, ctx, style: input.voice.style, side, usage: input.usage, triggers }, rng.fork(`${act}:${i}`), { allowCompose });
      if (!r) return null;
      if (recent.has(norm(r.text))) continue;
      sources.push(r.id);
      return r.text;
    }
    return null;
  };

  const out: (string | null)[] = [];
  let collab = false;
  let relDelta = 1;
  const asked = !!input.lastSimText && input.lastSimText.trim().endsWith("?");
  const isQuestion = triggers.has("question");
  const repeated = !!input.prevPlayerText && input.playerText.length > 2 && norm(input.prevPlayerText) === norm(input.playerText);

  if (repeated) out.push(say("dm_repeat"));
  else {
    switch (input.intent) {
      case "greeting":
        out.push(say(input.simGreeted ? "dm_regreet" : "dm_greet"));
        break;
      case "smalltalk":
        out.push(say("dm_smalltalk"));
        break;
      case "compliment":
        out.push(say("dm_compliment"));
        relDelta = 3;
        break;
      case "question":
        out.push(say("dm_answer"));
        break;
      case "advice_ask":
        out.push(say("dm_advice"));
        relDelta = 2;
        break;
      case "hostile":
        out.push(say("dm_hostile"));
        relDelta = -8;
        break;
      case "apology":
        out.push(say("dm_apology"));
        relDelta = 6;
        break;
      case "thanks":
        out.push(say("dm_thanks"));
        relDelta = 2;
        break;
      case "laugh":
        out.push(say("dm_laugh"));
        break;
      case "collab_ask": {
        const score = rel / 40 + (input.playerFame - input.simFame) / 30 + input.voice.traits.sociability * 0.6 + input.voice.traits.ambition * 0.3 + rng.range(-0.3, 0.3);
        if (score > 0.75) {
          out.push(say("dm_collab_yes"));
          collab = true;
          relDelta = 4;
        } else if (score > 0.3) out.push(say("dm_collab_maybe"));
        else out.push(say("dm_collab_no"));
        break;
      }
      default:
        // They answered a question the SIM asked: acknowledge the answer itself.
        out.push(say(asked && !isQuestion && !EMOTIONAL.some((t) => triggers.has(t)) ? "dm_ack" : "dm_react"));
    }
  }

  // Memory callback on warm relationships, early in the thread.
  if (input.memory && side === "ally" && input.historyCount < 6 && rng.chance(0.4)) out.push(say("dm_memory", false));
  // Keep the conversation going: sociable SIMs ask something back.
  const last = out.filter(Boolean).at(-1) ?? "";
  if (input.intent !== "hostile" && !collab && !repeated && !last.trim().endsWith("?") && rng.chance(0.2 + input.voice.traits.sociability * 0.35)) out.push(say("dm_followup", false));

  const voice = input.voice;
  const messages = out.filter((m): m is string => !!m).map((m) => humanize(m, voice, rng).slice(0, 500));
  // Chatty voices send one message per thought; others merge.
  const merged = voice.style === "casual" || voice.style === "hype" || messages.length <= 1 ? messages : [messages.join(" ")];
  return { messages: merged, seenOnly: false, collab, relDelta, sources };
}

export type DmOpenerKind = "fan" | "ally" | "rival" | "journalist" | "brand" | "peer";

const FORMAL_OPEN: Record<"journalist" | "brand", string[]> = {
  journalist: [
    "Hi, I'm writing a piece about the {hook} situation. Would you be open to giving a comment?",
    "Hey, reaching out for comment on the discussion around your recent post. Any statement?",
    "Working on a story about what's happening in {topic} this week. Your name keeps coming up. Want to share your side?",
  ],
  brand: [
    "Hi! We love your {topic} content. We'd like to offer you a paid post. Interested?",
    "Hey! Our team has been watching your growth. Want to partner on a sponsored post this week?",
  ],
};

export function dmOpener(kind: DmOpenerKind, ctx: { topic: string; hook?: string | null; playerUsername: string; usage?: UsageLedger | null }, voice: Voice, rng: Rng): string {
  if (kind === "journalist" || kind === "brand") {
    const v = vocabFor(ctx.topic);
    return rng.pick(FORMAL_OPEN[kind]).replace(/\{topic\}/g, v.name).replace(/\{hook\}/g, ctx.hook ?? rng.pick(v.nouns));
  }
  const r = respond({ act: `open_${kind}`, ctx: { topic: ctx.topic, name: ctx.playerUsername, hook: ctx.hook ?? null }, style: voice.style, usage: ctx.usage }, rng.fork("open"))!;
  return humanize(r.text, voice, rng);
}

/** Typing time for a message: humans type ~5 chars/sec plus a pause to read. */
export function typingMs(text: string, rng: Rng): number {
  return Math.round(clamp(1500 + text.length * rng.range(110, 220), 2000, 14_000));
}
