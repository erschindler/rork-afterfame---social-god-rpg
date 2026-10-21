import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Moon, Sun, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { callFn, errorMessage } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { THEMES } from "@/lib/topics";
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
      <PageHeader title="World Settings" subtitle={`${world.population.toLocaleString()} simulated people · ${theme_?.name ?? world.world_theme} · Private world`} />
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
      <Row title="Appearance">
        <Button variant="secondary" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
          {theme === "light" ? <Moon /> : <Sun />} {theme === "light" ? "Use dark mode" : "Use light mode"}
        </Button>
      </Row>
      <Row title="Shared worlds & private circles" body="Multiplayer worlds are architected but not open yet. Your world is private and visible only to you.">
        <span className="rounded-full bg-elevated px-3 py-1 text-sm text-muted-foreground">Coming later</span>
      </Row>
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
