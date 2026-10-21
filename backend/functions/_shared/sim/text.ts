/**
 * Layered rule-based text generation. Always available; no model required.
 * Templates are chosen from structured context (intent, stance, personality,
 * relationship) and then styled per communication style.
 */
import { Rng } from "./rng.ts";
import { vocabFor } from "./vocab.ts";
import type { CommStyle, HumorStyle, Traits } from "./population.ts";

export type PostIntent =
  | "observation" | "hot_take" | "question" | "announcement" | "joke" | "news_reaction" | "advice"
  | "personal" | "trend" | "feud_jab" | "apology" | "reconciliation" | "praise_other" | "milestone"
  | "recognize_player" | "collab_announce";

export type ReplyStance =
  | "praise" | "agree_add" | "disagree" | "critique" | "evidence_request" | "joke" | "question"
  | "misunderstand" | "defend" | "dunk" | "recognize" | "relate";

export interface Voice {
  style: CommStyle;
  humor: HumorStyle;
  traits: Traits;
}

export interface TextContext {
  topic: string;
  mention?: string;
  /** Short phrase lifted from the post being replied to / quoted. */
  hook?: string;
  tag?: string;
  num?: number;
  /** Name of a memory or prior interaction, e.g. "the speedrun thread". */
  memory?: string;
}

const POST_TEMPLATES: Record<PostIntent, string[]> = {
  observation: [
    "Noticed that {noun} have quietly changed in the last year. Not sure anyone talked about it.",
    "The thing about {noun} is that everyone pretends to have a plan.",
    "Spent the evening on {thing}. Came out with more questions than answers.",
    "{noun} are either the best or worst part of {topic}, and I keep switching sides.",
    "Every time I think I understand {noun}, {thing} proves me wrong.",
    "Small observation: the people who talk most about {noun} spend the least time on {thing}.",
    "Underrated part of {topic}: {thing}. Nobody posts about it.",
    "Rewatched my notes on {thing} and past me was very confident for no reason.",
  ],
  hot_take: [
    "hot take: {take}",
    "Unpopular opinion: {take}.",
    "I'll say it: {take}.",
    "{take}. I'm not taking questions.",
    "Controversial but correct: {take}.",
    "Been sitting on this one for a while. {take}.",
    "Can we admit that {take_lower}?",
  ],
  question: [
    "Genuine question for the {topic} people: what's the most overrated thing about {noun}?",
    "What's your take on {noun}? Trying to figure out if I'm the problem.",
    "Is it just me or has {thing} gotten weirder lately?",
    "Who here actually has opinions on {thing}? Asking for research purposes.",
    "If you could fix one thing about {noun}, what would it be?",
    "What changed your mind about {noun}? Looking for real stories.",
  ],
  announcement: [
    "Shipped {thing} after {num} months. Honest numbers coming in a thread.",
    "Big news: we're finally launching {thing}. Been a long road.",
    "New project dropping this week. It's about {noun}. More soon.",
    "Quietly put out {thing} today. If you check it out, tell me what's broken.",
    "{num} days of work and {thing} is finally live.",
  ],
  joke: [
    "me: I'll spend 10 minutes on {thing}\nme, four hours later:",
    "{noun} are just {thing} with extra steps",
    "my relationship with {thing} is purely parasocial at this point",
    "nobody:\nabsolutely nobody:\n{topic} people: {take_lower}",
    "if {thing} was a person it would reply-all",
    "added {thing} to my personality. no regrets.",
    "the {topic} discourse today is unhinged and I am here for it",
  ],
  news_reaction: [
    "Big if accurate: {news}. Reading through the details now.",
    "Reporting on this today: {news}. The full picture is more complicated than the headline.",
    "Wild day in {topic}: {news}.",
    "Everyone's talking about how {news}. A few things worth noting before the takes harden.",
    "Can't stop thinking about the fact that {news}.",
  ],
  advice: [
    "A rule I wish I'd learned earlier about {noun}: start smaller than you think.",
    "If you're new to {topic}, skip {thing} for now. Focus on the basics.",
    "Thread-worthy lesson: {take}. It took me years to see it.",
    "Practical tip: write down why you're doing {thing} before you do it.",
    "Most mistakes with {noun} come from rushing. Slow is smooth.",
  ],
  personal: [
    "Finally tried {thing} today. Mixed feelings.",
    "Today's small win: actually finished {thing}.",
    "Brain is fried. {thing} won today.",
    "Not me spending the whole weekend on {thing} again.",
    "Can't believe I used to hate {noun}. Growth.",
  ],
  trend: [
    "{tag} my contribution: {take}",
    "Late to {tag} but here's mine: {thing} changed how I see {noun}.",
    "Okay {tag} is getting out of hand and I love it",
    "{tag} has more nuance than people want to admit.",
    "Everyone on {tag} is arguing past each other. {take}.",
  ],
  feud_jab: [
    "Funny how {mention} only cares about {noun} when there's an audience.",
    "Still waiting for {mention} to explain that {thing} claim. I'll wait.",
    "{mention} keeps saying this like it's settled. It isn't.",
    "Respectfully, {mention} has been wrong about {noun} three times this month.",
    "Not going to name names but {mention} knows what they did with {thing}.",
  ],
  apology: [
    "I was out of line earlier. Sorry to {mention} and everyone caught in it.",
    "Thought about it overnight. I handled the {thing} conversation badly. That's on me.",
    "Owning this: I got the facts wrong about {noun}. Correction posted.",
  ],
  reconciliation: [
    "Talked it out with {mention}. We still disagree on {noun}, but we're good.",
    "Long DM with {mention}. Turns out we were arguing about two different things.",
    "Burying the hatchet with {mention}. Life's too short for {topic} beef.",
  ],
  praise_other: [
    "{mention} has been quietly doing the best {topic} work right now. Go follow.",
    "Shoutout to {mention} for that {thing} thread. Saved it.",
    "If you're not following {mention} for {topic}, fix that.",
  ],
  milestone: [
    "Hit {num} followers today. Didn't expect any of you. Thanks.",
    "Somehow {num} of you are here now. I'll try to keep it interesting.",
  ],
  recognize_player: [
    "Is {mention} the one who posted about {hook}? That stuck with me.",
    "Seeing {mention} everywhere this week. The {hook} post was good.",
    "{mention} said something about {hook} a while back that I still think about.",
    "Not sure how I ended up following {mention} but the {hook} take was right.",
  ],
  collab_announce: [
    "Working on something with {mention}. It's about {noun}. Soon.",
    "Collab with {mention} is live. Proud of this one.",
  ],
};

const REPLY_TEMPLATES: Record<ReplyStance, string[]> = {
  praise: [
    "This is the clearest anyone has put it.",
    "Saving this. The {hook} part especially.",
    "Needed to read this today, honestly.",
    "You put words to something I've felt about {noun} for months.",
    "Rare good post on {topic}. Following.",
    "The {hook} line is going to live in my head.",
  ],
  agree_add: [
    "Agree, and I'd add that {thing} makes it worse.",
    "Yes. And nobody mentions how {noun} feed into this.",
    "Exactly this. The {hook} point is underrated.",
    "This plus the fact that {take_lower}.",
    "Seconding this. Learned the same thing with {thing}.",
  ],
  disagree: [
    "I don't think that's right. {thing} kind of shows the opposite.",
    "Partly true, but {noun} helped me more than this gives credit for.",
    "Respectfully, no. The {hook} part doesn't hold up.",
    "Hard disagree. You're describing a small corner of {topic}.",
    "I see it, but I'd push back on the {hook} framing.",
  ],
  critique: [
    "This is the kind of take that sounds smart and falls apart on contact.",
    "Said this in 2019. Credit where due.",
    "Confidently wrong about {noun}, as is tradition.",
    "The {hook} part is doing a lot of heavy lifting with zero evidence.",
    "This is engagement bait and you know it.",
  ],
  evidence_request: [
    "Source? Not doubting, just want to read it.",
    "Is there data on this or is it vibes?",
    "Would love numbers on the {hook} part.",
    "Where's this from? The claim about {noun} doesn't match what I've seen.",
  ],
  joke: [
    "this is why i just make to-do lists with \"be a person\" at the top",
    "not the {hook} slander",
    "{noun} catching strays today",
    "my therapist is going to hear about this post",
    "reading this while doing {thing}. called out.",
    "it's not {hook}, it's capitalism with a nicer UI",
  ],
  question: [
    "Curious what made you land on this?",
    "Would this apply to {thing} too?",
    "How long did it take you to figure that out?",
    "What would you tell someone just starting with {noun}?",
  ],
  misunderstand: [
    "So you're saying {noun} are bad? Weird take.",
    "Wait, is this about {thing}? Feels like it's about {thing}.",
    "Not sure why you're attacking people who like {noun}.",
    "Hm, I read this as a joke at first. Is it serious?",
  ],
  defend: [
    "People in these replies are being way too harsh. The point stands.",
    "Love how everyone ignores the actual argument here.",
    "This person has been right about {noun} before. Hear them out.",
    "Leave them alone, the take is fine.",
  ],
  dunk: [
    "ratio",
    "imagine posting this with your whole chest",
    "the confidence is impressive. the take is not.",
    "who asked though",
    "{hook}? really? that's the hill?",
  ],
  recognize: [
    "Wait, you're the {hook} person. Love that.",
    "Oh I remember you from {memory}. Good to see you again.",
    "Been following since {memory}. Still consistently good.",
  ],
  relate: [
    "Same thing happened to me with {thing}.",
    "This is so real. {thing} did the same to me last month.",
    "Felt this in my bones.",
    "Every single word. Especially the {hook} part.",
  ],
};

const OPENERS: Record<CommStyle, string[]> = {
  casual: ["", "", "ok so ", "honestly ", "", "lowkey "],
  terse: ["", "", ""],
  snarky: ["", "sure, ", "ok but ", "", "imagine "],
  earnest: ["", "Honestly, ", "", "I really think ", ""],
  academic: ["", "Worth noting: ", "To be precise, ", "", "Small correction: "],
  hype: ["", "", "YES. ", "", "ok wait "],
  deadpan: ["", "", ""],
  formal: ["", "", ""],
};

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function applyStyle(text: string, voice: Voice, rng: Rng, allowOpener: boolean): string {
  let out = text;
  const opener = allowOpener ? rng.pick(OPENERS[voice.style]) : "";
  if (opener) out = opener + out.charAt(0).toLowerCase() + out.slice(1);
  switch (voice.style) {
    case "terse":
    case "deadpan":
      out = out.toLowerCase().replace(/\.$/, "");
      break;
    case "hype":
      if (rng.chance(0.3)) out = out.replace(/\.$/, "!");
      break;
    case "formal":
    case "academic":
      out = capitalize(out);
      break;
    case "casual":
      if (rng.chance(0.15)) out = out.replace(/\.$/, "") + rng.pick([" tbh", " lol", " imo"]);
      break;
    default:
      break;
  }
  if (!["terse", "deadpan"].includes(voice.style) && !/^[@#a-z]/.test(out)) out = capitalize(out);
  if (voice.style === "earnest" || voice.style === "formal") out = capitalize(out);
  return out.trim();
}

function fill(template: string, ctx: TextContext, rng: Rng): string {
  const v = vocabFor(ctx.topic);
  const take = rng.pick(v.takes);
  const thingA = rng.pick(v.things);
  let thingB = rng.pick(v.things);
  if (thingB === thingA) thingB = v.things[(v.things.indexOf(thingA) + 1) % v.things.length];
  let usedThing = 0;
  return template
    .replace(/\{take\}/g, capitalize(take))
    .replace(/\{take_lower\}/g, take)
    .replace(/\{noun\}/g, () => rng.pick(v.nouns))
    .replace(/\{thing\}/g, () => (usedThing++ === 0 ? thingA : thingB))
    .replace(/\{topic\}/g, v.name)
    .replace(/\{tag\}/g, ctx.tag ?? rng.pick(v.tags))
    .replace(/\{news\}/g, () => rng.pick(v.news))
    .replace(/\{num\}/g, String(ctx.num ?? rng.int(3, 18)))
    .replace(/\{mention\}/g, ctx.mention ?? "someone")
    .replace(/\{hook\}/g, ctx.hook ?? rng.pick(v.nouns))
    .replace(/\{memory\}/g, ctx.memory ?? "that thread");
}

export function generatePost(intent: PostIntent, ctx: TextContext, voice: Voice, rng: Rng): string {
  const templates = POST_TEMPLATES[intent];
  const raw = fill(rng.pick(templates), ctx, rng);
  const styled = applyStyle(raw, voice, rng, intent !== "joke" && intent !== "trend" && intent !== "hot_take");
  return styled.slice(0, 280);
}

export function generateReply(stance: ReplyStance, ctx: TextContext, voice: Voice, rng: Rng): string {
  const templates = REPLY_TEMPLATES[stance];
  const raw = fill(rng.pick(templates), ctx, rng);
  return applyStyle(raw, voice, rng, stance !== "dunk" && stance !== "joke").slice(0, 280);
}

export function generateQuote(stance: ReplyStance, ctx: TextContext, voice: Voice, rng: Rng): string {
  const frames: Partial<Record<ReplyStance, string[]>> = {
    praise: ["This deserves more eyes.", "Everyone in {topic} should read this.", "Co-signing every word."],
    critique: ["This is what's wrong with {topic} discourse.", "Quoting so I can find this when it ages badly.", "We need to talk about takes like this."],
    disagree: ["I think this misses something about {noun}.", "Interesting, but I land somewhere else on this.", "Good question, wrong answer."],
    dunk: ["lmao", "the confidence", "someone screenshot this"],
    joke: ["me reading this at 2am", "this but about {thing}", "posting this to the group chat immediately"],
    agree_add: ["Adding to this: {take_lower}.", "Yes, and the {hook} part is the key."],
  };
  const list = frames[stance] ?? frames.agree_add!;
  return applyStyle(fill(rng.pick(list), ctx, rng), voice, rng, false).slice(0, 280);
}

/** Pull a short memorable phrase out of a post to reference in replies. */
export function extractHook(content: string): string {
  const cleaned = content.replace(/https?:\/\/\S+/g, "").replace(/[@#]\w+/g, "").replace(/\s+/g, " ").trim();
  const quoted = cleaned.match(/['"\u2018\u201c]([^'"\u2019\u201d]{3,30})['"\u2019\u201d]/);
  if (quoted) return quoted[1].toLowerCase();
  const words = cleaned.split(" ").map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, "")).filter(Boolean);
  const stop = new Set(["about", "because", "really", "should", "would", "there", "their", "these", "those", "which", "think", "people", "always", "never", "actually", "everyone", "something"]);
  const candidates = words.filter((w) => w.length >= 5 && !stop.has(w.toLowerCase()));
  if (candidates.length === 0) return words.slice(0, 3).join(" ").toLowerCase() || "this";
  const longest = candidates.reduce((a, b) => (b.length > a.length ? b : a));
  const idx = words.indexOf(longest);
  const phrase = idx > 0 && words[idx - 1].length > 2 ? `${words[idx - 1]} ${longest}` : longest;
  return phrase.toLowerCase().slice(0, 40);
}

/** Choose a post intent consistent with archetype and personality. */
export function chooseIntent(archetype: string, traits: Traits, rng: Rng, hasTrend: boolean): PostIntent {
  const w: [PostIntent, number][] = [
    ["observation", 3],
    ["hot_take", 1 + traits.contrarian * 4 + traits.conflict_tolerance * 2],
    ["question", 1 + traits.sociability * 2],
    ["joke", 0.5 + traits.humor * 4],
    ["personal", 2 - traits.ambition],
    ["advice", traits.rigor * 2],
    ["trend", hasTrend ? 1 + (1 - traits.loyalty) * 2 : 0],
  ];
  if (["small_creator", "established_creator", "entrepreneur", "brand", "celebrity", "artist"].includes(archetype)) w.push(["announcement", 2.5]);
  if (archetype === "journalist") w.push(["news_reaction", 6]);
  if (archetype === "expert") w.push(["advice", 3]);
  if (archetype === "memer") w.push(["joke", 5]);
  return rng.weighted(w, ([, weight]) => weight)[0];
}
