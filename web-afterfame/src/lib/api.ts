import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "error", status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type FunctionName = "world" | "social" | "feed";

/**
 * Call a game edge function. All authoritative logic lives server-side;
 * errors are converted into user-safe messages.
 */
export async function callFn<T>(fn: FunctionName, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      let payload: { error?: string; code?: string } = {};
      try {
        payload = await res.json();
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(payload.error ?? "Request failed. Please try again.", payload.code ?? "error", res.status);
    }
    console.warn("[api] network error", fn, body.action);
    throw new ApiError("Can't reach the server. Check your connection and try again.", "network", 0);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
