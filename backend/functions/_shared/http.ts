import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// deno-lint-ignore no-explicit-any
export type Db = SupabaseClient<any, "public", any>;

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "error") {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export function adminClient(): Db {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(req: Request): Promise<{ id: string; email?: string }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw new HttpError(401, "Please sign in again.", "unauthorized");
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    log("warn", "auth_failed", { reason: error?.message ?? "no user" });
    throw new HttpError(401, "Please sign in again.", "unauthorized");
  }
  return { id: data.user.id, email: data.user.email ?? undefined };
}

export function log(level: "info" | "warn" | "error", msg: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, msg, ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/**
 * Keep the worker alive for follow-up simulation after responding.
 * Failures are logged; queued jobs remain pending and are retried by the next sync or cron run.
 */
export function runInBackground(p: Promise<unknown>): void {
  const safe = p.catch((err) => log("error", "background_failed", { error: err instanceof Error ? err.message : String(err) }));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(safe);
}

/** Wrap a handler with CORS, JSON parsing, and sanitized error responses. */
export function serve(name: string, handler: (req: Request, body: Record<string, unknown>) => Promise<unknown>): void {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const started = Date.now();
    let action = "unknown";
    try {
      const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};
      action = typeof body.action === "string" ? body.action : "default";
      const result = await handler(req, body);
      log("info", "request_ok", { fn: name, action, ms: Date.now() - started });
      return json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        log("warn", "request_rejected", { fn: name, action, status: err.status, code: err.code, message: err.message });
        return json({ error: err.message, code: err.code }, err.status);
      }
      log("error", "request_failed", { fn: name, action, ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) });
      return json({ error: "Something went wrong on our side. Please try again.", code: "internal" }, 500);
    }
  });
}

export function str(v: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
  if (v === undefined || v === null || v === "") {
    if (opts.optional) return "";
    throw new HttpError(400, `${field} is required.`, "invalid_input");
  }
  if (typeof v !== "string") throw new HttpError(400, `${field} must be text.`, "invalid_input");
  const s = v.trim();
  if (opts.min !== undefined && s.length < opts.min) throw new HttpError(400, `${field} is too short.`, "invalid_input");
  if (opts.max !== undefined && s.length > opts.max) throw new HttpError(400, `${field} is too long (max ${opts.max}).`, "invalid_input");
  return s;
}

export function uuid(v: unknown, field: string): string {
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) throw new HttpError(400, `${field} is invalid.`, "invalid_input");
  return v;
}

/** Throw a sanitized error if a Supabase call failed. */
export function check<T>(res: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) {
    log("error", "db_error", { what, code: res.error.code, message: res.error.message });
    throw new Error(`db:${what}`);
  }
  return res.data;
}
