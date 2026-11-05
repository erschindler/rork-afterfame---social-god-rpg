import { Bell, Cpu, Globe, Loader2, Volume2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AD_VARIANTS, BRANDS, hiddenBrands, unhideAllBrands } from "@/lib/ads";
import { playBlip, useNotifyPrefs } from "@/lib/notifyPrefs";
import { cn } from "@/lib/utils";
import { WEBLLM_MODELS, useLocalAi } from "@/providers/LocalAiProvider";

function Toggle({ title, body, checked, onChange, disabled }: { title: string; body?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn("flex items-center justify-between gap-4 py-2.5", disabled && "opacity-50")}>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        {body && <span className="block text-xs text-muted-foreground">{body}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

export function LocalAiPanel() {
  const ai = useLocalAi();
  const s = ai.support;
  const supportText = !s
    ? "Checking this browser..."
    : s.chrome
      ? "This browser has a built-in model. Nothing extra to download."
      : s.webgpu
        ? "WebGPU available. The selected model downloads once and is cached."
        : "No WebGPU here. Try a recent Chrome or Edge on desktop. SIMs will keep using the built-in writer.";
  const statusLabel = { off: "Off", loading: "Loading", ready: "Ready", error: "Error", unsupported: "Unsupported" }[ai.status];

  return (
    <section className="border-b border-border px-4 py-5" aria-label="On-device AI">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Cpu className="size-5" /></span>
          <div className="max-w-md">
            <p className="font-semibold">On-device AI for DMs</p>
            <p className="text-sm text-muted-foreground">
              A small model running in your browser rewrites SIM direct-message replies so they feel more natural. Free and private: nothing is sent to an AI service. If it is slow or fails, the built-in writer answers instead.
            </p>
          </div>
        </div>
        <Switch
          checked={ai.prefs.enabled}
          onCheckedChange={(on) => (on ? ai.enable() : ai.disable())}
          disabled={s !== null && !s.chrome && !s.webgpu}
          aria-label="On-device AI"
        />
      </div>

      <div className="mt-4 space-y-3 rounded-2xl border border-border bg-elevated/40 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Status</span>
          <span className={cn("inline-flex items-center gap-1.5 font-semibold", ai.status === "ready" && "text-brand", ai.status === "error" && "text-infamy")}>
            {ai.status === "loading" && <Loader2 className="size-3.5 animate-spin" />}
            {statusLabel}
            {ai.engine && <span className="font-normal text-muted-foreground">· {ai.engine === "chrome" ? "Built-in browser model" : "WebLLM"}</span>}
          </span>
        </div>
        {ai.status === "loading" && (
          <div className="space-y-1.5">
            <Progress value={Math.round(ai.progress * 100)} className="h-1.5" />
            <p className="truncate text-xs text-muted-foreground">{ai.detail || "Starting"} · {Math.round(ai.progress * 100)}%</p>
          </div>
        )}
        {ai.status === "error" && <p className="text-xs text-infamy">{ai.detail}</p>}
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Model</span>
          <Select value={ai.prefs.model} onValueChange={(m) => (ai.prefs.enabled ? ai.enable(m) : ai.setModel(m))} disabled={ai.engine === "chrome"}>
            <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WEBLLM_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.label} · {m.note} ({m.size})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">{supportText}</p>
      </div>
    </section>
  );
}

export function NotificationsPanel() {
  const [p, set] = useNotifyPrefs();
  const perm = typeof Notification === "undefined" ? "unsupported" : Notification.permission;

  const toggleSystem = async (on: boolean) => {
    if (!on) return set({ system: false });
    if (perm === "unsupported") return toast.error("This browser doesn't support notifications");
    const res = perm === "granted" ? "granted" : await Notification.requestPermission();
    if (res !== "granted") return toast.error("Notifications are blocked for this site in your browser settings");
    set({ system: true });
    new Notification("AFTERFAME", { body: "You'll get alerts here when the tab is in the background.", icon: "/favicon.ico" });
  };

  return (
    <section className="border-b border-border px-4 py-5" aria-label="Notifications">
      <div className="mb-2 flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Bell className="size-5" /></span>
        <div>
          <p className="font-semibold">Alerts on this device</p>
          <p className="text-sm text-muted-foreground">How you hear about replies and messages while you play.</p>
        </div>
      </div>
      <div className="divide-y divide-border">
        <Toggle title="Direct messages" body="When a SIM or player messages you" checked={p.dms} onChange={(v) => set({ dms: v })} />
        <Toggle title="Replies and mentions" body="When someone answers your posts" checked={p.replies} onChange={(v) => set({ replies: v })} />
        <Toggle title="In-app pop-ups" body="Small banner with a shortcut to open it" checked={p.toasts} onChange={(v) => set({ toasts: v })} />
        <Toggle
          title="System notifications"
          body={perm === "denied" ? "Blocked in your browser settings" : "Only when this tab is in the background"}
          checked={p.system && perm === "granted"}
          onChange={toggleSystem}
          disabled={perm === "unsupported" || perm === "denied"}
        />
        <div className="flex items-center justify-between gap-4 py-2.5">
          <span>
            <span className="block text-sm font-medium">Sound</span>
            <span className="block text-xs text-muted-foreground">A short chime for new alerts</span>
          </span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => playBlip("dm")} className="rounded-full p-1.5 text-muted-foreground hover:bg-elevated hover:text-foreground" aria-label="Preview sound">
              <Volume2 className="size-4" />
            </button>
            <Switch checked={p.sound} onCheckedChange={(v) => set({ sound: v })} />
          </span>
        </div>
      </div>
    </section>
  );
}

export function AdsPanel({ worldId }: { worldId: string }) {
  const [hidden, setHidden] = useState<number>(() => hiddenBrands().length);
  return (
    <section className="flex flex-col gap-3 border-b border-border px-4 py-5 sm:flex-row sm:items-center sm:justify-between" aria-label="Ads">
      <div className="max-w-sm">
        <p className="font-semibold">Fictional ads</p>
        <p className="text-sm text-muted-foreground">
          {BRANDS.length} made-up companies, {AD_VARIANTS.toLocaleString()} ad variations. Tap any promoted post to visit its fake website. {hidden > 0 ? `${hidden} advertiser${hidden === 1 ? "" : "s"} hidden.` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {hidden > 0 && (
          <Button variant="ghost" onClick={() => { unhideAllBrands(); setHidden(0); toast("Hidden advertisers restored"); }}>Unhide all</Button>
        )}
        <Button asChild variant="secondary"><Link to={`/w/${worldId}/site`}><Globe /> Browse sites</Link></Button>
      </div>
    </section>
  );
}
