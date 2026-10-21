/**
 * Optional language-model adapter. Disabled unless TEXT_MODEL_ENDPOINT is set
 * AND the world opted into "model" mode. The model only rephrases text that the
 * rule-based system already produced; it never decides outcomes. Any failure
 * falls back silently to the template text.
 *
 * Expected endpoint: OpenAI-compatible POST {endpoint}/chat/completions
 * (works with Ollama, llama.cpp server, vLLM, LM Studio, or a hosted provider).
 */
import { LIMITS } from "./config.ts";

export interface ModelConfig {
  endpoint: string;
  model: string;
  apiKey?: string;
}

export function readModelConfig(env: (k: string) => string | undefined): ModelConfig | null {
  const endpoint = env("TEXT_MODEL_ENDPOINT");
  if (!endpoint) return null;
  return { endpoint: endpoint.replace(/\/$/, ""), model: env("TEXT_MODEL_ID") ?? "llama3.1", apiKey: env("TEXT_MODEL_API_KEY") };
}

let callsThisInvocation = 0;
const MAX_CALLS_PER_INVOCATION = 6;

export async function rephrase(cfg: ModelConfig | null, fallback: string, persona: string, context: string): Promise<string> {
  if (!cfg || callsThisInvocation >= MAX_CALLS_PER_INVOCATION) return fallback;
  callsThisInvocation++;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LIMITS.textModelTimeoutMs);
  try {
    const res = await fetch(`${cfg.endpoint}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 90,
        temperature: 0.8,
        messages: [
          { role: "system", content: `You write one short social media post as a fictional person. Persona: ${persona}. Keep the same meaning and stance as the draft. Max 240 characters. No hashtags unless in draft. No emojis unless in draft. Output only the post text.` },
          { role: "user", content: `Context: ${context}\nDraft: ${fallback}` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`model status ${res.status}`);
    const json = await res.json();
    const text: unknown = json?.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new Error("model returned no text");
    const cleaned = text.trim().replace(/^"|"$/g, "").slice(0, 280);
    return cleaned.length >= 3 ? cleaned : fallback;
  } catch (err) {
    console.warn(JSON.stringify({ level: "warn", msg: "optional_model_failed", error: err instanceof Error ? err.message : "unknown" }));
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
