/**
 * Response-bank usage ledgers, one per world, cached for the life of the edge
 * worker. Entry points call `ensureLedger` (loads the last 3 days of usage),
 * generators read `ledgerFor` synchronously, and `flushLedgers` writes the
 * increments back in one RPC per world. Failures never break gameplay.
 */
import type { Db } from "../http.ts";
import { UsageLedger, WINDOW_DAYS } from "../sim/bank/usage.ts";

const ledgers = new Map<string, { ledger: UsageLedger; loadedAt: number }>();
const TTL_MS = 5 * 60_000;

export function ledgerFor(worldId: string): UsageLedger {
  let l = ledgers.get(worldId);
  if (!l) {
    l = { ledger: new UsageLedger(), loadedAt: 0 };
    ledgers.set(worldId, l);
  }
  return l.ledger;
}

export async function ensureLedger(db: Db, worldId: string): Promise<UsageLedger> {
  const cur = ledgers.get(worldId);
  if (cur && cur.loadedAt && Date.now() - cur.loadedAt < TTL_MS) return cur.ledger;
  try {
    if (cur?.ledger.dirty) await flushOne(db, worldId, cur.ledger);
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
    const res = await db.from("response_usage").select("entry_id, uses").eq("world_id", worldId).gte("last_used_at", since).order("last_used_at", { ascending: false }).limit(20000);
    if (res.error) throw res.error;
    const ledger = new UsageLedger((res.data ?? []) as { entry_id: string; uses: number }[]);
    ledgers.set(worldId, { ledger, loadedAt: Date.now() });
    return ledger;
  } catch (e) {
    console.error("ledger_load", e);
    return ledgerFor(worldId);
  }
}

async function flushOne(db: Db, worldId: string, ledger: UsageLedger): Promise<void> {
  const d = ledger.drain();
  if (!d.ids.length) return;
  const { error } = await db.rpc("bump_response_usage", { w: worldId, ids: d.ids, counts: d.counts });
  if (error) {
    ledger.restore(d);
    console.error("ledger_flush", error.message);
  }
}

export async function flushLedgers(db: Db, worldId?: string): Promise<void> {
  for (const [id, l] of ledgers) {
    if (worldId && id !== worldId) continue;
    if (l.ledger.dirty) await flushOne(db, id, l.ledger);
  }
}
