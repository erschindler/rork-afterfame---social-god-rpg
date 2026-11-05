/**
 * On-the-fly composer: the fallback when no fresh bank entry fits. It parses
 * the message (question type, echo phrase, mood) and assembles a reply from
 * independent clause pools (lead + core + reason + hand-back), so the output
 * is built for this message rather than pulled whole from a list.
 */
import type { Rng } from "../rng.ts";
import { expand, tidy } from "./grammar.ts";
import { applyMacros } from "./macros.ts";
import { questionKind, type Trigger } from "./triggers.ts";
import { type BankContext, slotFn } from "./index.ts";

type Family = "agree" | "disagree" | "humor" | "ask" | "answer" | "social" | "post";

const FAMILY: Record<string, Family> = {
  agree: "agree", agree_extend: "agree", thank: "agree", defend_op: "agree", friend_arrive: "agree", concede: "agree", dm_compliment: "agree", dm_thanks: "agree",
  counter: "disagree", rebut: "disagree", escalate: "disagree", partial_agree: "disagree", evidence_request: "disagree", receipts: "disagree", clarify: "disagree", pile_on: "disagree", dm_hostile: "disagree",
  joke: "humor", laugh: "humor", build_joke: "humor", dm_laugh: "humor",
  ask_followup: "ask", dm_followup: "ask", tag_friend: "ask",
  answer: "answer", dm_answer: "answer", dm_advice: "answer",
};

const ANSWER: Record<string, string[]> = {
  origin: [
    "{honestly|ok so|long story short}, {<my_thing> in <year> did it|I fell into <my_topic> through <my_thing>|a friend got me into <my_thing> and it stuck}",
    "{it was|blame} <my_thing>. {<year>.|I was bored in <year>.} {never looked back|been hooked since}",
  ],
  wyd: ["{right now|this week} {mostly <my_goal>|it's <my_goal>}, {plus <my_thing>|and some <my_thing> on the side}"],
  why: ["{because|mostly because|honestly because} <take>", "{the real reason|the boring reason} is {<noun>|that <take>}"],
  how: ["{slowly|one step at a time}: {<thing> first, then <thing2>|lots of <thing>}", "{practice, mostly|repetition}. {<thing> helped|<thing2> was the shortcut}"],
  yesno: ["{yes|yeah|honestly yes}, {mostly because <take>|if you count <thing>}", "{no|not really}, {<take>|<thing> changed my mind}", "{sometimes|depends}: {on <noun>|on the day}"],
  recs: ["{<thing>, then <thing2>|start with <thing>}. {skip <noun>|trust me}"],
  opinion: ["{my take|$imo}: <take>", "{mixed feelings|it's complicated}. {<take>|<noun> make it messy}"],
  what: ["{<thing>, easily|probably <thing>|<my_thing>}", "{hard to pick|tough one}, {but <thing>|<thing> I think}"],
  generic: ["{good question|hm}. {<thing>, probably|I'd say <noun>}", "{honestly not sure|no clue}, {maybe <thing>?|<noun>?}"],
};

const LEAD: Record<Family, string> = {
  agree: "{$yes|$agree|right|honestly yeah|this}",
  disagree: "{hm, not sure|I don't know about that|eh|respectfully|I see it differently}",
  humor: "{$lol|okay this is funny|not gonna lie I laughed}",
  ask: "{wait|curious|okay real question}",
  answer: "{so|honestly|okay}",
  social: "{oh|ah|hm|okay}",
  post: "{so|okay|thinking about it}",
};

const CORE: Record<Family, string[]> = {
  agree: ["{<echo> really is|the <echo> part is} {the point|underrated|exactly it}", "\"<q>\" {is the whole thing|says it}", "{you're right about <echo>|<echo>, yes}"],
  disagree: ["{<echo> isn't really the issue|it's less about <echo>}, {it's <noun>|<take>}", "\"<q>\" {doesn't quite hold|skips over <noun>}"],
  humor: ["{the <echo> of it all|<echo> slander at this hour}", "\"<q>\" {is sending me|should be on a mug}"],
  ask: ["{what do you mean by <echo>?|how'd you get into <echo>?|why <echo> though?}", "{is \"<q>\" from experience?|what happened with <echo>?}"],
  answer: [],
  social: ["{<echo>? tell me more|<echo> sounds like a lot|didn't know you were into <echo>}", "{that's fair|makes sense}. {<echo> is a whole thing|<echo> is interesting}"],
  post: ["{<thing> keeps coming up|<noun> are on my mind}"],
};

const REASON = "{because <take>|since <noun> exist|and <thing> proves it|which is why <take>}";
const HANDBACK = "{what about you?|you?|thoughts?|right?|agree?|how about you?}";

function line(src: string, rng: Rng, slot: (n: string) => string | null): string | null {
  return expand(applyMacros(src), rng, slot);
}

export function compose(act: string, ctx: BankContext, triggers: Set<Trigger>, rng: Rng): string {
  const slot = slotFn(ctx, rng);
  const fam: Family = FAMILY[act] ?? (act.startsWith("post_") ? "post" : "social");
  const parts: string[] = [];
  if (fam === "answer") {
    const qk = questionKind(triggers) ?? "generic";
    const core = line(rng.pick(ANSWER[qk] ?? ANSWER.generic), rng, slot) ?? line(rng.pick(ANSWER.generic), rng, slot)!;
    parts.push(core);
    if (rng.chance(0.35)) parts.push(line(HANDBACK, rng, slot)!);
  } else {
    if (rng.chance(0.6)) parts.push(line(LEAD[fam], rng, slot)!);
    const cores = rng.shuffle(CORE[fam]);
    let core: string | null = null;
    for (const c of cores) if ((core = line(c, rng, slot))) break;
    parts.push(core ?? line("{<thing>|<noun>} {though|honestly|for sure}", rng, slot)!);
    if ((fam === "disagree" || fam === "agree") && rng.chance(0.45)) parts.push(line(REASON, rng, slot)!);
    if (fam === "social" && rng.chance(0.4)) parts.push(line(HANDBACK, rng, slot)!);
  }
  let out = parts.filter(Boolean).join(parts.length > 1 && fam !== "answer" ? ", " : ". ");
  out = tidy(out.replace(/,\s*([A-Za-z]+\?)$/, ". $1"));
  return out.charAt(0).toUpperCase() + out.slice(1);
}
