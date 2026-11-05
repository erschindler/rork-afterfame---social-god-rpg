import { useEffect, useState } from "react";

export interface NotifyPrefs {
  toasts: boolean;
  system: boolean;
  sound: boolean;
  dms: boolean;
  replies: boolean;
}

const KEY = "af.notify.v1";
const EVT = "af-notify-prefs";
const DEFAULTS: NotifyPrefs = { toasts: true, system: false, sound: true, dms: true, replies: true };

export function getNotifyPrefs(): NotifyPrefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<NotifyPrefs>) };
  } catch {
    return DEFAULTS;
  }
}

export function setNotifyPrefs(patch: Partial<NotifyPrefs>) {
  const next = { ...getNotifyPrefs(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVT));
}

export function useNotifyPrefs(): [NotifyPrefs, (p: Partial<NotifyPrefs>) => void] {
  const [prefs, set] = useState<NotifyPrefs>(getNotifyPrefs);
  useEffect(() => {
    const on = () => set(getNotifyPrefs());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return [prefs, setNotifyPrefs];
}

let audio: AudioContext | null = null;
/** Short two-note blip made with WebAudio; no audio files. */
export function playBlip(kind: "dm" | "reply" = "reply") {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const ctx = audio;
    if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
    const notes = kind === "dm" ? [660, 990] : [880, 660];
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.09;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.14);
    });
  } catch {
    /* sound is optional */
  }
}
