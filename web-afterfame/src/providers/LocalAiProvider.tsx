import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * On-device language model for SIM DM replies. Nothing leaves the browser and
 * nothing is paid for: Chrome's built-in model (Prompt API) when available,
 * otherwise a small open model run on the GPU with WebLLM. The server always
 * keeps a written draft, so a missing or slow model never blocks a reply.
 */

export type LocalEngine = "chrome" | "webllm";
export type LocalStatus = "off" | "loading" | "ready" | "error" | "unsupported";

export const WEBLLM_MODELS = [
  { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 0.5B", size: "about 400 MB", note: "Fastest" },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B", size: "about 900 MB", note: "Balanced" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 1.5B", size: "about 1.2 GB", note: "Best writing" },
] as const;

interface Prefs {
  enabled: boolean;
  model: string;
}

const KEY = "af.localAi.v1";

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
    return { enabled: raw.enabled === true, model: typeof raw.model === "string" ? raw.model : WEBLLM_MODELS[0].id };
  } catch {
    return { enabled: false, model: WEBLLM_MODELS[0].id };
  }
}

interface ChromeSession {
  prompt: (text: string) => Promise<string>;
  destroy?: () => void;
}
interface ChromeLanguageModel {
  availability: () => Promise<"unavailable" | "downloadable" | "downloading" | "available">;
  create: (opts: { initialPrompts?: { role: string; content: string }[]; monitor?: (m: EventTarget) => void }) => Promise<ChromeSession>;
}
interface WebLlmEngine {
  chat: { completions: { create: (req: { messages: { role: "system" | "user" | "assistant"; content: string }[]; temperature?: number; max_tokens?: number }) => Promise<{ choices: { message: { content: string | null } }[] }> } };
  unload?: () => Promise<void>;
}

function chromeModel(): ChromeLanguageModel | null {
  const g = globalThis as unknown as { LanguageModel?: ChromeLanguageModel };
  return g.LanguageModel ?? null;
}

export async function detectSupport(): Promise<{ chrome: boolean; webgpu: boolean }> {
  let chrome = false;
  const lm = chromeModel();
  if (lm) {
    try {
      chrome = (await lm.availability()) !== "unavailable";
    } catch {
      chrome = false;
    }
  }
  const webgpu = typeof navigator !== "undefined" && "gpu" in navigator;
  return { chrome, webgpu };
}

export interface DmPrompt {
  username: string;
  display_name: string;
  archetype: string;
  style: string;
  bio?: string;
  interests?: string[];
  relationship?: number;
  player: string;
  history: { from: string; text: string }[];
}

const SYSTEM = (p: DmPrompt, draft: string[]) =>
  [
    `You are ${p.display_name} (@${p.username}), a fictional ${p.archetype.replace(/_/g, " ")} on a small social network. Bio: "${p.bio ?? ""}". You care about ${(p.interests ?? []).join(", ")}.`,
    `Your texting style is ${p.style}. You are DMing @${p.player}. Your relationship score with them is ${p.relationship ?? 0} (-100 hostile, 0 stranger, 100 close friend).`,
    "Write your next DM reply. Keep it short and human: one or two lines, under 200 characters each, like real texting. No hashtags. No emojis unless your style is hype. Never say you are an AI or a character. Never use quotation marks around the reply.",
    `A suggested reply is: ${draft.join(" / ")}. Keep its meaning and attitude but make it sound natural and specific to the conversation.`,
    "Output only the message text. Put a second message on a new line only if it helps.",
  ].join("\n");

function transcript(p: DmPrompt): string {
  return p.history.map((h) => `${h.from === "player" ? "@" + p.player : "you"}: ${h.text}`).join("\n") + "\nyou:";
}

export function cleanOutput(raw: string, p: DmPrompt): string[] {
  return raw
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(you|me|assistant|@[\w.]+)\s*:\s*/i, ""))
    .map((l) => l.replace(/^["'“]+|["'”]+$/g, "").replace(new RegExp(`^@?${p.username}\\s*:\\s*`, "i"), "").trim())
    .filter((l) => l.length > 0 && l.length <= 400 && !/^(note|draft|suggested)/i.test(l))
    .slice(0, 2);
}

export const [LocalAiProvider, useLocalAi] = createContextHook(() => {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [status, setStatus] = useState<LocalStatus>("off");
  const [progress, setProgress] = useState<number>(0);
  const [detail, setDetail] = useState<string>("");
  const [engine, setEngine] = useState<LocalEngine | null>(null);
  const [support, setSupport] = useState<{ chrome: boolean; webgpu: boolean } | null>(null);
  const chrome = useRef<ChromeLanguageModel | null>(null);
  const webllm = useRef<WebLlmEngine | null>(null);
  const loadingRef = useRef<boolean>(false);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  }, [prefs]);

  useEffect(() => {
    detectSupport().then(setSupport);
  }, []);

  const load = useCallback(async (model: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setStatus("loading");
    setProgress(0);
    setDetail("Checking your browser");
    try {
      const s = support ?? (await detectSupport());
      const lm = chromeModel();
      if (s.chrome && lm) {
        setDetail("Preparing the browser's built-in model");
        const probe = await lm.create({
          monitor: (m) => m.addEventListener("downloadprogress", (e) => setProgress((e as unknown as { loaded: number }).loaded)),
        });
        probe.destroy?.();
        chrome.current = lm;
        setEngine("chrome");
        setStatus("ready");
        setDetail("Built-in browser model");
        return;
      }
      if (!s.webgpu) {
        setStatus("unsupported");
        setDetail("This browser has no WebGPU. Try a recent Chrome or Edge on a desktop.");
        return;
      }
      const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
      const eng = await CreateMLCEngine(model, {
        initProgressCallback: (r: { progress: number; text: string }) => {
          setProgress(r.progress);
          setDetail(r.text.replace(/\[.*?\]\s*/g, "").slice(0, 90));
        },
      });
      webllm.current = eng as unknown as WebLlmEngine;
      setEngine("webllm");
      setStatus("ready");
      setDetail(WEBLLM_MODELS.find((m) => m.id === model)?.label ?? model);
    } catch (err) {
      console.error("local_ai_load", err);
      setStatus("error");
      setDetail(err instanceof Error ? err.message.slice(0, 140) : "The model could not start.");
    } finally {
      loadingRef.current = false;
    }
  }, [support]);

  // Resume a previously enabled model on page load (served from the browser cache after the first download).
  useEffect(() => {
    if (prefs.enabled && status === "off" && support) load(prefs.model);
  }, [prefs.enabled, prefs.model, status, support, load]);

  const enable = useCallback((model?: string) => {
    const m = model ?? prefs.model;
    if (webllm.current && m !== prefs.model) {
      webllm.current.unload?.().catch(() => undefined);
      webllm.current = null;
    }
    setPrefs({ enabled: true, model: m });
    setStatus("off");
  }, [prefs.model]);

  const disable = useCallback(() => {
    setPrefs((p) => ({ ...p, enabled: false }));
    webllm.current?.unload?.().catch(() => undefined);
    webllm.current = null;
    chrome.current = null;
    setEngine(null);
    setStatus("off");
    setProgress(0);
    setDetail("");
  }, []);

  /** Rewrite a SIM DM draft with the local model. Throws when unavailable or slow. */
  const writeDm = useCallback(async (p: DmPrompt, draft: string[], timeoutMs = 25_000): Promise<string[]> => {
    if (status !== "ready") throw new Error("Local model is not ready");
    const run = async (): Promise<string> => {
      if (engine === "chrome" && chrome.current) {
        const session = await chrome.current.create({ initialPrompts: [{ role: "system", content: SYSTEM(p, draft) }] });
        try {
          return await session.prompt(transcript(p));
        } finally {
          session.destroy?.();
        }
      }
      if (engine === "webllm" && webllm.current) {
        const res = await webllm.current.chat.completions.create({
          messages: [
            { role: "system", content: SYSTEM(p, draft) },
            { role: "user", content: transcript(p) },
          ],
          temperature: 0.85,
          max_tokens: 90,
        });
        return res.choices[0]?.message.content ?? "";
      }
      throw new Error("No engine");
    };
    const out = await Promise.race([run(), new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))]);
    return cleanOutput(out, p);
  }, [status, engine]);

  return { prefs, status, progress, detail, engine, support, enable, disable, setModel: (model: string) => setPrefs((p) => ({ ...p, model })), writeDm, ready: status === "ready" };
});
