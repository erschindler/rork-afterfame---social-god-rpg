/**
 * Per-world usage ledger for bank entries. Pure in-memory structure; the game
 * layer loads it from `response_usage` and flushes increments back in one
 * upsert. Entries past their cap within the window are skipped, and exact
 * texts are never repeated within the window.
 */
import { hashString } from "../rng.ts";

export const CAP_TRIGGERED = 4;
export const CAP_GENERIC = 8;
export const WINDOW_DAYS = 3;

export function textKey(text: string): string {
  return "t:" + hashString(text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")).toString(36);
}

export class UsageLedger {
  private uses = new Map<string, number>();
  private pending = new Map<string, number>();

  constructor(rows: { entry_id: string; uses: number }[] = []) {
    for (const r of rows) this.uses.set(r.entry_id, r.uses);
  }

  count(id: string): number {
    return this.uses.get(id) ?? 0;
  }

  seenText(text: string): boolean {
    return this.uses.has(textKey(text));
  }

  record(id: string, text: string): void {
    for (const k of [id, textKey(text)]) {
      this.uses.set(k, (this.uses.get(k) ?? 0) + 1);
      this.pending.set(k, (this.pending.get(k) ?? 0) + 1);
    }
  }

  get dirty(): boolean {
    return this.pending.size > 0;
  }

  /** Increments since the last drain. */
  drain(): { ids: string[]; counts: number[] } {
    const ids = [...this.pending.keys()];
    const counts = ids.map((k) => this.pending.get(k) ?? 0);
    this.pending.clear();
    return { ids, counts };
  }

  /** Put drained increments back after a failed flush. */
  restore(d: { ids: string[]; counts: number[] }): void {
    d.ids.forEach((k, i) => this.pending.set(k, (this.pending.get(k) ?? 0) + d.counts[i]));
  }
}
