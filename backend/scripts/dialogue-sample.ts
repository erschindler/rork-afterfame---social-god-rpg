/** Prints a sample simulated conversation. Run: deno run backend/scripts/dialogue-sample.ts [seed] */
import { Rng } from "../functions/_shared/sim/rng.ts";
import { chooseAct, generateDialogue, nextHeat, sideBetween, type DialogueAct, type Participant } from "../functions/_shared/sim/dialogue.ts";
import type { Traits } from "../functions/_shared/sim/population.ts";
import type { CommStyle } from "../functions/_shared/sim/population.ts";

const rng = new Rng(Deno.args[0] ?? "demo");
const t = (o: Partial<Traits>): Traits => ({ warmth: 0.5, aggression: 0.3, rigor: 0.5, humor: 0.5, ambition: 0.5, sociability: 0.6, conflict_tolerance: 0.6, risk_tolerance: 0.5, loyalty: 0.5, openness: 0.5, contrarian: 0.4, ...o });
const people: (Participant & { traits: Traits; style: CommStyle })[] = [
  { id: "a", username: "framedrop", team: "pro", traits: t({ aggression: 0.5 }), style: "snarky" },
  { id: "b", username: "glitchqueen", team: "con", traits: t({ rigor: 0.8 }), style: "casual" },
  { id: "c", username: "routeplanner", team: "neutral", traits: t({ warmth: 0.8, humor: 0.7 }), style: "earnest" },
];
const root = "Glitchless categories are the only runs that actually show skill. Any% is just exploiting bugs.";
console.log(`@framedrop: ${root}\n`);
let prev = root, prevSpeaker = people[0], prevAct: DialogueAct | null = null, heat = 0.6;
const used: string[] = [];
for (let turn = 0; turn < 10 && heat > 0.1; turn++) {
  const candidates = people.filter((p) => p.id !== prevSpeaker.id);
  const speaker = turn % 3 === 2 ? candidates[candidates.length - 1] : candidates[0];
  const side = sideBetween(speaker.team, prevSpeaker.team);
  const act = chooseAct(prevAct, side, speaker.traits, heat, rng.fork(turn), { prevIsQuestion: prev.includes("?"), turn });
  const line = generateDialogue(act, { topic: "speedrunning", prevContent: prev, prevAuthor: prevSpeaker.username, opAuthor: "framedrop", others: people.map((p) => p.username), multiParty: true, usedKeys: used }, { style: speaker.style, humor: "dry", traits: speaker.traits }, rng.fork(`t${turn}`));
  used.push(line.key);
  console.log(`${"  ".repeat(Math.min(turn + 1, 4))}@${speaker.username} [${act}]: ${line.text}`);
  prev = line.text; prevSpeaker = speaker; prevAct = act; heat = nextHeat(heat, act);
  if (act === "exit") break;
}
