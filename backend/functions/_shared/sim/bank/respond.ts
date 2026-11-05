/**
 * Front door of the bank: indexed lookup first, on-the-fly composition when
 * every fitting entry is used up (or the act has no bucket).
 */
import type { Rng } from "../rng.ts";
import { type BankRequest, pickLine } from "./index.ts";
import { compose } from "./compose.ts";
import { detectTriggers } from "./triggers.ts";

export interface BankResponse {
  text: string;
  id: string;
  source: "bank" | "composed";
}

export function respond(req: BankRequest, rng: Rng, opts: { allowCompose?: boolean } = {}): BankResponse | null {
  const triggers = req.triggers ?? detectTriggers(req.ctx.text ?? "");
  const hit = pickLine({ ...req, triggers }, rng);
  if (hit) return { text: hit.text, id: hit.id, source: "bank" };
  if (opts.allowCompose === false) return null;
  const text = compose(req.act, req.ctx, triggers, rng);
  req.usage?.record(`composed.${req.act}`, text);
  return { text, id: `composed.${req.act}`, source: "composed" };
}
