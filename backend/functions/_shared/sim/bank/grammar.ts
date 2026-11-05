/**
 * Tiny combinatorial grammar used by the response bank.
 *
 *   {a|b|c}   pick one alternative (alternatives may nest)
 *   [x]       optional: included about half the time
 *   <slot>    filled from the context at expansion time
 *
 * Each source line compiles once (cached) to a small AST. `countVariants` gives
 * the exact number of distinct surface forms a line can produce before slots
 * are filled, which is how the bank reports its size honestly.
 */
import type { Rng } from "../rng.ts";

export type Node =
  | { t: "lit"; v: string }
  | { t: "slot"; v: string }
  | { t: "alt"; opts: Node[][] }
  | { t: "opt"; body: Node[] };

const cache = new Map<string, Node[]>();

function parseSeq(src: string, i: number, stop: string): [Node[], number] {
  const out: Node[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "lit", v: buf });
    buf = "";
  };
  while (i < src.length) {
    const c = src[i];
    if (stop.includes(c)) break;
    if (c === "{") {
      flush();
      const opts: Node[][] = [];
      i++;
      for (;;) {
        const [seq, j] = parseSeq(src, i, "|}");
        opts.push(seq);
        i = j;
        if (src[i] === "|") {
          i++;
          continue;
        }
        i++; // "}" (or end of input)
        break;
      }
      out.push({ t: "alt", opts });
      continue;
    }
    if (c === "[") {
      flush();
      const [body, j] = parseSeq(src, i + 1, "]");
      out.push({ t: "opt", body });
      i = j + 1;
      continue;
    }
    if (c === "<") {
      const end = src.indexOf(">", i);
      if (end > i && /^<[a-z_]+>$/.test(src.slice(i, end + 1))) {
        flush();
        out.push({ t: "slot", v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    buf += c;
    i++;
  }
  flush();
  return [out, i];
}

export function compile(src: string): Node[] {
  let ast = cache.get(src);
  if (!ast) {
    ast = parseSeq(src, 0, "")[0];
    cache.set(src, ast);
  }
  return ast;
}

export function countNodes(nodes: Node[]): number {
  let n = 1;
  for (const node of nodes) {
    if (node.t === "alt") n *= node.opts.reduce((s, o) => s + countNodes(o), 0);
    else if (node.t === "opt") n *= 1 + countNodes(node.body);
  }
  return n;
}

export function countVariants(src: string): number {
  return countNodes(compile(src));
}

export type SlotFn = (name: string) => string | null | undefined;

function expandNodes(nodes: Node[], rng: Rng, slot: SlotFn, missing: string[]): string {
  let s = "";
  for (const node of nodes) {
    if (node.t === "lit") s += node.v;
    else if (node.t === "slot") {
      const v = slot(node.v);
      if (v == null || v === "") missing.push(node.v);
      else s += v;
    } else if (node.t === "alt") s += expandNodes(rng.pick(node.opts), rng, slot, missing);
    else if (rng.chance(0.5)) s += expandNodes(node.body, rng, slot, missing);
  }
  return s;
}

/** Expand a line. Returns null if a required slot had no value. */
export function expand(src: string, rng: Rng, slot: SlotFn): string | null {
  const missing: string[] = [];
  const out = expandNodes(compile(src), rng, slot, missing);
  if (missing.length) return null;
  return tidy(out);
}

/** Collapse spacing and punctuation artifacts left by optional pieces. */
export function tidy(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([,;:])(?=[.!?])/g, "")
    .replace(/,{2,}/g, ",")
    .replace(/([!?])\.+/g, "$1")
    .replace(/\.\s*\./g, ".")
    .replace(/\.{4,}/g, "...")
    .replace(/^[,;:\s]+/, "")
    .trim();
}

/** Slots a line needs, for index-time filtering. */
export function slotsOf(src: string): string[] {
  const out = new Set<string>();
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.t === "slot") out.add(n.v);
      else if (n.t === "alt") n.opts.forEach(walk);
      else if (n.t === "opt") walk(n.body);
    }
  };
  walk(compile(src));
  return [...out];
}
