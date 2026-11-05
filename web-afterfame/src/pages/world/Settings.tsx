import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, DoorOpen, Flag, Link2, Loader2, LogOut, Moon, RefreshCw, Sun, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Avatar } from "@/components/Avatar";
import { AdsPanel, LocalAiPanel, NotificationsPanel } from "@/components/DevicePanels";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { callFn, errorMessage } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import { THEMES } from "@/lib/topics";
import type { MemberRow, ReportRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useWorld } from "@/providers/WorldProvider";

function Row({ title, body, children }: { title: string; body?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-sm">
        <p className="font-semibold">{title}</p>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function PlayersPanel({ isOwner }: { isOwner: boolean }) {
  const { worldId } = useWorld();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<boolean>(false);
  const q = useQuery({
    queryKey: ["members", worldId],
    queryFn: () => callFn<{ code: string | null; maxMembers: number; members: MemberRow[] }>("world", { action: "members", worldId }),
  });
  const code = q.data?.code ?? null;
  const link = code ? `${window.location.origin}/join/${code}` : "";

  const run = async (action: "invite" | "revoke_invite", extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      await callFn("world", { action, worldId, ...extra });
      toast(action === "invite" ? (extra.regenerate ? "New invite link created. The old one stopped working." : "Invite link ready") : "Invite link turned off");
      queryClient.invalidateQueries({ queryKey: ["members", worldId] });
      queryClient.invalidateQueries({ queryKey: ["sync", worldId] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    try {
      await callFn("world", { action: "leave", worldId });
      toast("You left the world");
      navigate("/worlds");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <section className="border-b border-border px-4 py-5" aria-label="Players">
      <div className="flex items-start justify-between gap-3">
        <div className="max-w-sm">
          <p className="font-semibold">Players in this world</p>
          <p className="text-sm text-muted-foreground">Invite up to {q.data?.maxMembers ?? 8} real friends. You'll share the same SIM population, trends and drama.</p>
        </div>
        <span className="shrink-0 rounded-full bg-elevated px-3 py-1 text-sm tabular-nums text-muted-foreground">
          {q.data ? `${q.data.members.length}/${q.data.maxMembers}` : "…"}
        </span>
      </div>
      <ul className="mt-4 flex flex-col gap-2">
        {(q.data?.members ?? []).map((m) => {
          const online = m.last_seen_at && Date.now() - Date.parse(m.last_seen_at) < 5 * 60_000;
          return (
            <li key={m.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5">
              <div className="relative">
                <Avatar seed={m.avatar_reference} size={36} />
                {online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-brand ring-2 ring-surface" aria-label="Online" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{m.display_name}{m.isYou && <span className="ml-1.5 font-normal text-muted-foreground">(you)</span>}</p>
                <p className="truncate text-[13px] text-muted-foreground">@{m.username} · {m.current_rank}{!online && m.last_seen_at ? ` · seen ${timeAgo(m.last_seen_at)}` : ""}</p>
              </div>
              {m.role === "owner" && <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand">Host</span>}
            </li>
          );
        })}
      </ul>
      {isOwner ? (
        <div className="mt-4">
          {code ? (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background/60 p-1.5 pl-3">
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-sm">{link}</span>
                <Button
                  size="sm"
                  className="rounded-lg font-bold"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      toast("Invite link copied");
                    } catch {
                      toast(`Invite code: ${code}`);
                    }
                  }}
                >
                  <Copy /> Copy
                </Button>
              </div>
              <p className="mt-2 text-[13px] text-muted-foreground">Code <span className="font-mono font-semibold tracking-widest text-foreground">{code}</span></p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => run("invite", { regenerate: true })}><RefreshCw /> New link</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run("revoke_invite")} className="text-infamy hover:text-infamy">Turn off invites</Button>
              </div>
            </>
          ) : (
            <Button disabled={busy || q.isLoading} onClick={() => run("invite")} className="font-bold">
              {busy ? <Loader2 className="animate-spin" /> : <Link2 />} Create invite link
            </Button>
          )}
        </div>
      ) : (
        <Button variant="ghost" className="mt-3 text-infamy hover:text-infamy" onClick={leave}><DoorOpen /> Leave this world</Button>
      )}
    </section>
  );
}

const REPORT_TONE: Record<ReportRow["status"], string> = {
  open: "bg-elevated text-muted-foreground",
  reviewed: "bg-credibility/15 text-credibility",
  actioned: "bg-brand/15 text-brand",
  dismissed: "bg-elevated text-muted-foreground",
};
const REPORT_LABEL: Record<ReportRow["status"], string> = { open: "In review", reviewed: "Reviewed", actioned: "Action taken", dismissed: "Dismissed" };

function ReportsPanel() {
  const { worldId } = useWorld();
  const q = useQuery({
    queryKey: ["reports", worldId],
    queryFn: () => callFn<ReportRow[]>("feed", { action: "reports", worldId }),
    refetchInterval: 30_000,
  });
  const rows = q.data ?? [];
  return (
    <section className="border-b border-border px-4 py-5" aria-label="Your reports">
      <p className="font-semibold">Your reports</p>
      <p className="text-sm text-muted-foreground">World moderators review reports within a few minutes. Real players are never punished automatically.</p>
      {rows.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Flag className="h-4 w-4" /> You haven't reported anything.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.slice(0, 8).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium capitalize">{r.target_entity_type === "sim" ? "Account" : r.target_entity_type} · <span className="normal-case text-muted-foreground">{r.reason}</span></p>
                <p className="text-[12px] text-muted-foreground">{timeAgo(r.created_at)}</p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold", REPORT_TONE[r.status])}>{REPORT_LABEL[r.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Settings() {
  const { world, worldId } = useWorld();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState<string>(world?.name ?? "");
  const [pace, setPace] = useState<string>(world?.world_pace ?? "standard");
  const [busy, setBusy] = useState<boolean>(false);
  const [confirm, setConfirm] = useState<string>("");
  const isOwner = world?.owner_id === user?.id;

  const settings = useQuery({
    queryKey: ["world-settings", worldId],
    queryFn: async () => {
      const [{ data, error }, model] = await Promise.all([
        supabase.from("world_settings").select("text_generation_mode").eq("world_id", worldId).maybeSingle(),
        callFn<{ modelAvailable: boolean }>("world", { action: "model_status", worldId }),
      ]);
      if (error) throw new Error("Couldn't load settings.");
      return { mode: data?.text_generation_mode ?? "rules", modelAvailable: model.modelAvailable };
    },
  });
  useEffect(() => {
    if (world) {
      setName(world.name);
      setPace(world.world_pace);
    }
  }, [world]);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await callFn("world", { action: "update_settings", worldId, ...patch });
      toast("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["sync", worldId] });
      queryClient.invalidateQueries({ queryKey: ["world-settings", worldId] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    try {
      await callFn("world", { action: "delete", worldId, confirm });
      toast("World deleted");
      queryClient.removeQueries({ queryKey: ["sync", worldId] });
      navigate("/worlds");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (!world) return null;
  const theme_ = THEMES.find((t) => t.id === world.world_theme);

  return (
    <div>
      <PageHeader title="World Settings" subtitle={`${world.population.toLocaleString()} simulated people · ${theme_?.name ?? world.world_theme} · ${world.privacy_mode === "shared" ? "Shared world" : "Private world"}`} />
      <Row title="World name">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save({ name }); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={!isOwner} className="w-56" aria-label="World name" />
          <Button type="submit" variant="secondary" disabled={!isOwner || busy || name === world.name}>Save</Button>
        </form>
      </Row>
      <Row title="World pace" body="Changes how fast simulated time passes. It never changes how fair the world is.">
        <RadioGroup value={pace} onValueChange={(v) => { setPace(v); save({ pace: v }); }} className="flex gap-4" disabled={!isOwner}>
          {[["relaxed", "Relaxed"], ["standard", "Standard"], ["fast", "Fast"]].map(([id, label]) => (
            <label key={id} className="flex items-center gap-2 text-sm"><RadioGroupItem value={id} /> {label}</label>
          ))}
        </RadioGroup>
      </Row>
      <Row title="Text generation" body={settings.data?.modelAvailable ? "An optional language model is configured on the server. It only rephrases text; it never decides outcomes." : "Built-in rule-based writer. No AI service or API key needed. Server admins can optionally connect a local or hosted model."}>
        <label className="flex items-center gap-3 text-sm">
          <span>Use optional model</span>
          <Switch checked={settings.data?.mode === "model"} disabled={!settings.data?.modelAvailable || !isOwner || busy} onCheckedChange={(on) => save({ textMode: on ? "model" : "rules" })} />
        </label>
      </Row>
      <LocalAiPanel />
      <NotificationsPanel />
      <AdsPanel worldId={worldId} />
      <Row title="Appearance">
        <Button variant="secondary" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
          {theme === "light" ? <Moon /> : <Sun />} {theme === "light" ? "Use dark mode" : "Use light mode"}
        </Button>
      </Row>
      <PlayersPanel isOwner={isOwner} />
      <ReportsPanel />
      <Row title="Account" body={user?.email ?? undefined}>
        <Button variant="secondary" onClick={signOut}><LogOut /> Sign out</Button>
      </Row>
      {isOwner && (
        <div className="m-4 rounded-2xl border border-infamy/40 p-4">
          <p className="font-semibold text-infamy">Delete this world</p>
          <p className="mt-1 text-sm text-muted-foreground">Permanently removes every account, post, relationship and memory in this world. Type DELETE to confirm.</p>
          <div className="mt-3 flex gap-2">
            <Label htmlFor="del" className="sr-only">Confirm delete</Label>
            <Input id="del" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" className="w-40" />
            <Button variant="destructive" disabled={confirm !== "DELETE"} onClick={del}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete world
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
