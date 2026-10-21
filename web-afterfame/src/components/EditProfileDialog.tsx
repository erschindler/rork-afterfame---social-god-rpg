import { useQueryClient } from "@tanstack/react-query";
import { Dices, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { callFn, errorMessage } from "@/lib/api";
import { TOPICS } from "@/lib/topics";
import { cn } from "@/lib/utils";
import { useWorld } from "@/providers/WorldProvider";

export function EditProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { player, worldId } = useWorld();
  const queryClient = useQueryClient();
  const [name, setName] = useState<string>(player?.display_name ?? "");
  const [bio, setBio] = useState<string>(player?.bio ?? "");
  const [avatar, setAvatar] = useState<string>(player?.avatar_reference ?? "");
  const [interests, setInterests] = useState<string[]>(player?.interests ?? []);
  const [publicStats, setPublicStats] = useState<boolean>(player?.public_stats ?? true);
  const [busy, setBusy] = useState<boolean>(false);

  const save = async () => {
    setBusy(true);
    try {
      await callFn("world", { action: "update_profile", worldId, displayName: name, bio, avatar, interests, publicStats });
      toast("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["sync", worldId] });
      queryClient.invalidateQueries({ queryKey: ["profile", worldId] });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-2xl border-border bg-card">
        <DialogTitle>Edit profile</DialogTitle>
        <DialogDescription>Public details people in this world see.</DialogDescription>
        <div className="flex items-center gap-4">
          <Avatar seed={avatar} size={72} />
          <Button type="button" variant="secondary" onClick={() => setAvatar(`${player?.username ?? "me"}-${Math.random().toString(36).slice(2, 8)}`)}>
            <Dices /> New look
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ep-name">Display name</Label>
          <Input id="ep-name" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ep-bio">Bio</Label>
          <Textarea id="ep-bio" value={bio} maxLength={160} onChange={(e) => setBio(e.target.value)} rows={3} />
          <p className="text-right text-xs text-muted-foreground">{bio.length}/160</p>
        </div>
        <div className="space-y-2">
          <Label>Interests</Label>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((t) => {
              const on = interests.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setInterests(on ? interests.filter((i) => i !== t.id) : interests.length < 6 ? [...interests, t.id] : interests)}
                  className={cn("rounded-full border px-3 py-1 text-sm transition-colors", on ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground hover:text-foreground")}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <span>
            <span className="block text-sm font-medium">Show reputation stats publicly</span>
            <span className="block text-xs text-muted-foreground">Other players in shared worlds could see your fame, credibility and infamy.</span>
          </span>
          <Switch checked={publicStats} onCheckedChange={setPublicStats} />
        </label>
        <Button onClick={save} disabled={busy || !name.trim() || interests.length === 0} className="font-bold">
          {busy && <Loader2 className="animate-spin" />} Save
        </Button>
      </DialogContent>
    </Dialog>
  );
}
