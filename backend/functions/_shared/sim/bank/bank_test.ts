// Run: deno test backend/functions/_shared/sim/bank/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { Rng } from "../rng.ts";
import { VOCAB } from "../vocab.ts";
import { bankStats, detectTriggers, pickLine, UsageLedger } from "./index.ts";
import { respond } from "./respond.ts";
import { CAP_TRIGGERED } from "./usage.ts";
import { countVariants, expand } from "./grammar.ts";

Deno.test("bank holds millions of distinct responses", () => {
  const s = bankStats(Object.keys(VOCAB));
  assert(s.lines > 400, `lines ${s.lines}`);
  assert(s.filled > 1_000_000, `filled ${s.filled}`);
});

Deno.test("grammar expands alternatives, options and slots", () => {
  assertEquals(countVariants("{a|b} [c] d"), 4);
  assertEquals(expand("hi <name>", new Rng("g"), (n) => (n === "name" ? "sam" : null)), "hi sam");
  assertEquals(expand("hi <missing>", new Rng("g"), () => null), null);
});

Deno.test("origin questions get origin answers", () => {
  const triggers = detectTriggers("what got you into this?");
  assert(triggers.has("q_origin"));
  let origin = 0;
  for (let i = 0; i < 30; i++) {
    const hit = pickLine({ act: "dm_answer", ctx: { topic: "gaming", text: "what got you into this?", myTopic: "gaming" }, triggers, style: "casual" }, new Rng(`o${i}`));
    assert(hit);
    if (/(got into|into it|started|friend|dragged|origin|stubborn|years ago|20\d\d|excuse)/i.test(hit.text)) origin++;
  }
  assert(origin >= 20, `origin-like answers ${origin}/30`);
});

Deno.test("usage caps exhaust the bank and fall back to composition", () => {
  const usage = new UsageLedger();
  const ctx = { topic: "gaming", text: "hey!", myTopic: "gaming" };
  const triggers = detectTriggers("hey!");
  const seen = new Set<string>();
  let composed = 0;
  for (let i = 0; i < 400; i++) {
    const r = respond({ act: "dm_greet", ctx, triggers, usage, style: "casual" }, new Rng(`u${i}`));
    assert(r);
    if (r.source === "composed") composed++;
    else {
      assert(usage.count(r.id) <= CAP_TRIGGERED * 3, `entry ${r.id} overused`);
      seen.add(r.text.toLowerCase());
    }
  }
  assert(composed > 0, "never composed");
  assert(seen.size > 20, `variety ${seen.size}`);
});
