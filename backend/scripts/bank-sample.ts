// Prints response-bank size and sample replies for a few messages.
// Run: deno run backend/scripts/bank-sample.ts
import { bankStats, UsageLedger } from "../functions/_shared/sim/bank/index.ts";
import { classifyDm, dmReply } from "../functions/_shared/sim/dm.ts";
import { generateDialogue } from "../functions/_shared/sim/dialogue.ts";
import { generatePost } from "../functions/_shared/sim/text.ts";
import { Rng } from "../functions/_shared/sim/rng.ts";
import { VOCAB } from "../functions/_shared/sim/vocab.ts";
import type { Traits } from "../functions/_shared/sim/population.ts";

const s = bankStats(Object.keys(VOCAB));
console.log(`acts=${s.acts} lines=${s.lines} templates=${s.templates.toLocaleString()} filled=${s.filled.toLocaleString()} voiced=${s.voiced.toLocaleString()}`);

const traits: Traits = { warmth: 0.6, aggression: 0.2, rigor: 0.5, humor: 0.6, ambition: 0.5, sociability: 0.7, conflict_tolerance: 0.4, risk_tolerance: 0.5, loyalty: 0.5, openness: 0.6, contrarian: 0.3 };
const usage = new UsageLedger();
const dms = ["what got you into this?", "hey!", "what are you working on this week?", "I just got promoted at work!!", "any recs for a beginner?", "why do you post so much about speedruns?", "lol", "you're a clown", "I'm learning to bake sourdough lately", "do you ever sleep?"];
for (const [i, text] of dms.entries()) {
  for (const style of ["casual", "earnest"] as const) {
    const out = dmReply({ intent: classifyDm(text), playerText: text, playerUsername: "dm_tester", simArchetype: "hobbyist", topic: "speedrunning", voice: { style, humor: "dry", traits }, relationship: 20, simFame: 5, playerFame: 5, historyCount: 3, simGreeted: true, simGoal: "grow their own audience", lastSimText: "what are you up to?", usage }, new Rng(`s${i}${style}`));
    console.log(`DM [${style}] "${text}" -> ${out.messages.join(" | ")}`);
  }
}
const posts = ["Hot take: patch 1.4 ruined ranked and nobody wants to admit it", "Finally shipped my first indie game after 18 months!!", "why does every coffee shop charge $7 now?"];
for (const [i, p] of posts.entries()) {
  for (const act of ["agree", "counter", "joke", "ask_followup", "answer"] as const) {
    const l = generateDialogue(act, { topic: "gaming", prevContent: p, prevAuthor: "player1", opAuthor: "player1", usage }, { style: "casual", humor: "absurd", traits }, new Rng(`p${i}${act}`));
    console.log(`${act}: "${p.slice(0, 30)}" -> ${l.text}`);
  }
}
for (const intent of ["hot_take", "question", "joke", "personal", "milestone"] as const) console.log(`post ${intent}: ${generatePost(intent, { topic: "music" }, { style: "casual", humor: "dry", traits }, new Rng(intent))}`);
