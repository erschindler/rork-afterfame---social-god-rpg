/**
 * Scheduled world simulation (called by pg_cron every few minutes).
 * Protected by a random secret stored in the private app_secrets table.
 */
import { adminClient, check, HttpError, log, serve } from "../_shared/http.ts";
import { syncWorld } from "../_shared/game/tick.ts";
import { TICK_SECONDS } from "../_shared/sim/config.ts";
import type { WorldRow } from "../_shared/game/types.ts";

serve("simulate", async (req) => {
  const db = adminClient();
  const provided = req.headers.get("x-cron-secret") ?? "";
  const secret = check(await db.from("app_secrets").select("value").eq("name", "cron_secret").single(), "load_cron_secret") as { value: string };
  if (!provided || provided !== secret.value) throw new HttpError(401, "Unauthorized", "unauthorized");

  const started = Date.now();
  const cutoff = new Date(Date.now() - TICK_SECONDS.fast * 1000).toISOString();
  const worlds = check(await db.from("worlds").select("*").eq("status", "ready").lt("last_simulated_at", cutoff).order("last_simulated_at").limit(12), "due_worlds") as WorldRow[];
  let processed = 0;
  for (const w of worlds) {
    if (Date.now() - started > 40_000) break;
    try {
      await syncWorld(db, w, { maxTicks: 2 });
      processed++;
    } catch (err) {
      log("error", "cron_world_failed", { world: w.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { processed, due: worlds.length, ms: Date.now() - started };
});
