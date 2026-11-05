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

export type DmIntent =
  | "greeting" | "smalltalk" | "question" | "compliment" | "hostile" | "collab_ask" | "apology" | "thanks" | "laugh" | "advice_ask" | "other";

export function classifyDm(text: string): DmIntent {
  const t = text.toLowerCase().trim();
  if (/\b(idiot|stupid|trash|clown|loser|pathetic|shut up|fraud|grifter|hate you|moron)\b/.test(t)) return "hostile";
  if (/\b(sorry|apologi[sz]e|my bad|i was wrong|out of line)\b/.test(t)) return "apology";
  if (/\b(collab|work together|team up|podcast|feature|partner|stream together|guest)\b/.test(t)) return "collab_ask";
  if (/\b(advice|tips?|how do (you|i)|any recs|recommend)\b/.test(t)) return "advice_ask";
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
}

export interface DmReplyOutput {
  /** Empty means the SIM left the player on "Seen". */
  messages: string[];
  seenOnly: boolean;
  /** SIM is open to a collaboration (caller creates the invite). */
  collab: boolean;
  /** Relationship nudge from this exchange. */
  relDelta: number;
}

function pickFresh(rng: Rng, list: string[], avoid: string[] = []): string {
  const fresh = list.filter((l) => !avoid.some((a) => a.toLowerCase().includes(l.toLowerCase().slice(0, 18))));
  return rng.pick(fresh.length ? fresh : list);
}

function fill(s: string, input: DmReplyInput, rng: Rng): string {
  const v = vocabFor(input.topic);
  return s
    .replace(/\{name\}/g, `@${input.playerUsername}`)
    .replace(/\{topic\}/g, v.name)
    .replace(/\{thing\}/g, () => rng.pick(v.things))
    .replace(/\{noun\}/g, () => rng.pick(v.nouns))
    .replace(/\{take_lower\}/g, rng.pick(v.takes))
    .replace(/\{hook\}/g, input.recentPostHook ?? rng.pick(v.nouns))
    .replace(/\{memory\}/g, input.memory ?? "that thread");
}

const R = {
  greetWarm: ["hey!! good to hear from you", "oh hey, what's up", "heyy", "hi! was literally just thinking about your last post", "yo! how's it going"],
  greetCool: ["hey", "hi", "yo", "hey, what's up?", "hello"],
  greetCold: ["...hi?", "what do you want", "hey. surprised you messaged honestly"],
  smalltalk: ["not bad, been buried in {thing} all week", "honestly tired lol. {topic} discourse is a lot right now", "good! just finished {thing} finally", "surviving. you?", "busy but good. you've been posting a lot lately, I see you"],
  compliment: ["wait that's so nice, thank you", "omg thank you. means a lot coming from you", "appreciate that a lot honestly", "stop you're gonna make me blush", "thank you!! your {hook} post was really good too btw"],
  complimentCool: ["thanks", "appreciate it", "ty"],
  question: ["good question. I'd say {thing}, mostly because {take_lower}", "honestly? {thing}. don't overthink it", "depends on what you're going for but {noun} is a safe bet", "hmm. I'd go with {thing}. ask me again tomorrow though lol", "short version: {take_lower}"],
  advice: ["start smaller than you think. seriously. {thing} taught me that", "post consistently and reply to people. that's 80% of it", "find 5 people in {topic} you actually like and talk to them, not at them", "don't chase the algorithm. chase the conversations", "honestly just keep doing the {hook} stuff, that's what people like about you"],
  hostileBack: ["wow ok", "not sure what I did to deserve this but ok", "blocking is free you know", "you good?", "lol. noted"],
  hostileHit: ["say that in public then", "this is why nobody takes you seriously", "screenshotting this btw", "bold of you to slide into my DMs for this"],
  apologyAccept: ["hey, I appreciate that. we're good", "thanks for saying that. water under the bridge", "honestly respect for reaching out. all good", "ok that means something. thank you"],
  apologyCool: ["noted", "ok. thanks I guess", "appreciate it but it was pretty public, you know?"],
  thanks: ["of course!", "anytime", "np!", "happy to help", "ofc 🙌"],
  laugh: ["lmao right", "😭", "I'm dead", "lol exactly", "hahaha"],
  other: ["true", "honestly yeah", "lol fair", "that's interesting, say more?", "hmm I see what you mean", "real", "wait really?"],
  collabYes: ["oh I'd actually love that. sending you something now", "yes! been wanting to do a {topic} thing with someone. let's do it", "down. let me send you the details", "ok yes. this could be fun"],
  collabMaybe: ["maybe? what did you have in mind", "hmm I'm pretty booked but tell me more", "depends on the idea tbh. pitch me"],
  collabNo: ["appreciate it but I'm not taking collabs right now", "flattered but gonna pass for now", "not really my thing, sorry"],
  followups: ["what are you working on lately?", "you going to post about {thing}?", "how'd you get into {topic} anyway?", "did you see the {noun} discourse today?", "what's your take on {thing}?"],
  memoryRef: ["still think about the {memory} thing btw", "also thanks again for {memory}", "not gonna lie I remember {memory}"],
};

/** Decide and write the SIM's reply. Pure; deterministic given rng. */
export function dmReply(input: DmReplyInput, rng: Rng): DmReplyOutput {
  const rel = input.relationship;
  const gap = input.simFame - input.playerFame;
  const avoid = input.recentSimTexts ?? [];
  // Big accounts leave strangers on Seen.
  const seenChance = clamp((gap - 15) / 60 - rel / 80 + (input.intent === "hostile" ? 0.25 : 0) + (input.historyCount > 14 ? 0.15 : 0), 0, 0.85);
  if (rng.chance(seenChance)) return { messages: [], seenOnly: true, collab: false, relDelta: 0 };

  const warm = rel >= 15;
  const cold = rel <= -15;
  const out: string[] = [];
  let collab = false;
  let relDelta = 1;

  switch (input.intent) {
    case "greeting":
      out.push(pickFresh(rng, input.simGreeted ? R.other : cold ? R.greetCold : warm ? R.greetWarm : R.greetCool, avoid));
      break;
    case "smalltalk":
      out.push(pickFresh(rng, R.smalltalk, avoid));
      break;
    case "compliment":
      out.push(pickFresh(rng, gap > 30 && !warm ? R.complimentCool : R.compliment, avoid));
      relDelta = 3;
      break;
    case "question":
      out.push(pickFresh(rng, R.question, avoid));
      break;
    case "advice_ask":
      out.push(pickFresh(rng, R.advice, avoid));
      relDelta = 2;
      break;
    case "hostile":
      out.push(pickFresh(rng, input.voice.traits.aggression > 0.5 || cold ? R.hostileHit : R.hostileBack, avoid));
      relDelta = -8;
      break;
    case "apology":
      out.push(pickFresh(rng, input.voice.traits.warmth + input.voice.traits.openness > 0.9 ? R.apologyAccept : R.apologyCool, avoid));
      relDelta = 6;
      break;
    case "thanks":
      out.push(pickFresh(rng, R.thanks, avoid));
      relDelta = 2;
      break;
    case "laugh":
      out.push(pickFresh(rng, R.laugh, avoid));
      break;
    case "collab_ask": {
      const score = rel / 40 + (input.playerFame - input.simFame) / 30 + input.voice.traits.sociability * 0.6 + input.voice.traits.ambition * 0.3 + rng.range(-0.3, 0.3);
      if (score > 0.75) {
        out.push(fill(pickFresh(rng, R.collabYes, avoid), input, rng));
        collab = true;
        relDelta = 4;
      } else if (score > 0.3) out.push(pickFresh(rng, R.collabMaybe, avoid));
      else out.push(pickFresh(rng, R.collabNo, avoid));
      break;
    }
    default:
      out.push(pickFresh(rng, R.other, avoid));
  }

  // Memory callback on warm relationships, early in the thread.
  if (input.memory && warm && input.historyCount < 6 && rng.chance(0.4)) out.push(pickFresh(rng, R.memoryRef, avoid));
  // Keep the conversation going: sociable SIMs ask something back.
  if (input.intent !== "hostile" && !collab && rng.chance(0.25 + input.voice.traits.sociability * 0.4)) out.push(pickFresh(rng, R.followups, avoid));

  const voice = input.voice;
  const messages = out.map((m) => humanize(fill(m, input, rng), voice, rng).slice(0, 500));
  // Chatty voices send one message per thought; others merge.
  const merged = voice.style === "casual" || voice.style === "hype" || messages.length === 1 ? messages : [messages.join(" ")];
  return { messages: merged, seenOnly: false, collab, relDelta };
}

export type DmOpenerKind = "fan" | "ally" | "rival" | "journalist" | "brand" | "peer";

const OPEN: Record<DmOpenerKind, string[]> = {
  fan: [
    "hey sorry if this is weird but your {hook} post genuinely made my week",
    "just wanted to say I've been following since your first posts and you're killing it",
    "ok I have to ask, how do you come up with your takes?? the {hook} one was so good",
    "not me sending this at 2am but your posts about {topic} are the only good ones on here",
  ],
  ally: [
    "hey, saw what happened in your replies. you good?",
    "ignore the noise, the {hook} post was right",
    "been meaning to say, love what you're doing with the {topic} stuff",
    "you free to talk sometime? have an idea you might like",
  ],
  rival: [
    "we can keep doing this in public or we can talk like adults. your call",
    "not sure what your problem is with me but it's getting old",
    "you know half your replies are just dunking on me right?",
  ],
  journalist: [
    "Hi, I'm writing a piece about the {hook} situation. Would you be open to giving a comment?",
    "Hey, reaching out for comment on the discussion around your recent post. Any statement?",
    "Working on a story about what's happening in {topic} this week. Your name keeps coming up. Want to share your side?",
  ],
  brand: [
    "Hi! We love your {topic} content. We'd like to offer you a paid post. Interested?",
    "Hey! Our team has been watching your growth. Want to partner on a sponsored post this week?",
  ],
  peer: [
    "hey! we keep ending up in the same threads lol, figured I'd say hi",
    "saw your take on {hook}. curious what you think about {thing}",
  ],
};

export function dmOpener(kind: DmOpenerKind, ctx: { topic: string; hook?: string | null; playerUsername: string }, voice: Voice, rng: Rng): string {
  const input = { intent: "other", playerText: "", playerUsername: ctx.playerUsername, simArchetype: "", topic: ctx.topic, voice, relationship: 0, simFame: 0, playerFame: 0, historyCount: 0, simGreeted: false, recentPostHook: ctx.hook } as DmReplyInput;
  const raw = fill(rng.pick(OPEN[kind]), input, rng);
  return kind === "journalist" || kind === "brand" ? raw : humanize(raw, voice, rng);
}

/** Typing time for a message: humans type ~5 chars/sec plus a pause to read. */
export function typingMs(text: string, rng: Rng): number {
  return Math.round(clamp(1500 + text.length * rng.range(110, 220), 2000, 14_000));
}
