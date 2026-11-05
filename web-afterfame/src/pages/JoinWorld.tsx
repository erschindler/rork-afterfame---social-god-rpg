import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2, Store, Target, User, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { AvatarPicker } from "@/components/AvatarPicker";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callFn, errorMessage } from "@/lib/api";
import { THEMES, TOPICS, topicName } from "@/lib/topics";
import type { InvitePreview } from "@/lib/types";
import { cn } from "@/lib/utils";

const STARTS = [
  { id: "ordinary", icon: User, title: "Ordinary account", body: "Unknown, a handful of followers." },
  { id: "niche", icon: Target, title: "Niche enthusiast", body: "Small audience in one topic." },
  { id: "creator", icon: Store, title: "Fresh creator", body: "New creator account, tiny audience." },
];

export default function JoinWorld() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ["invite", code],
    queryFn: () => callFn<InvitePreview>("world", { action: "preview_invite", code }),
    retry: false,
  });

  const [displayName, setDisplayName] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [bio, setBio] = useState<string>("");
  const [avatar, setAvatar] = useState<string>(() => `me-${Math.random().toString(36).slice(2, 8)}`);
  const [interests, setInterests] = useState<string[]>([]);
  const [start, setStart] = useState<string>("ordinary");
  const [niche, setNiche] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const theme = preview.data?.world.theme ?? "mixed";
  const themeTopics = useMemo(() => THEMES.find((t) => t.id === theme)?.topics ?? [], [theme]);
  const usernameOk = /^[a-z0-9_]{3,20}$/.test(username);
  const taken = !!preview.data?.players.some((p) => p.username === username);
  const canJoin = displayName.trim().length > 0 && usernameOk && !taken && interests.length > 0 && !busy;

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await callFn<{ worldId: string }>("world", {
        action: "join", code,
        persona: { displayName: displayName.trim(), username, bio: bio.trim(), avatar, interests, startingCondition: start, nicheTopic: start === "niche" ? niche || interests[0] : null },
      });
      queryClient.invalidateQueries({ queryKey: ["worlds"] });
      navigate(`/w/${res.worldId}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const p = preview.data;
  const full = !!p && !p.alreadyMember && p.memberCount >= p.maxMembers;

  return (
    <div className="relative min-h-dvh">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto max-w-2xl px-5 py-8">
        <header className="mb-8 flex items-center justify-between">
          <Logo />
          <Link to="/worlds" className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </Link>
        </header>

        {preview.isLoading && (
          <div className="flex justify-center py-24" role="status" aria-label="Loading invite">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {preview.isError && (
          <div className="panel px-6 py-14 text-center">
            <p className="text-xl font-bold">Invite not found</p>
            <p className="mt-1 text-sm text-muted-foreground">{errorMessage(preview.error)}</p>
            <Button asChild className="mt-6 rounded-xl font-bold">
              <Link to="/worlds">Back to your worlds</Link>
            </Button>
          </div>
        )}

        {p && (
          <div className="space-y-8 animate-rise-in">
            <section className="panel overflow-hidden">
              <div className="border-b border-border px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand">You're invited</p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight">{p.world.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {THEMES.find((t) => t.id === p.world.theme)?.name ?? "Mixed Internet"} · {p.world.size} population · {p.world.pace} pace
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {p.players.slice(0, 5).map((pl) => (
                      <Avatar key={pl.username} seed={pl.avatar_reference} size={32} className="ring-2 ring-card" />
                    ))}
                  </div>
                  <p className="text-sm">
                    {p.host ? (
                      <>
                        Hosted by <span className="font-semibold">@{p.host.username}</span>
                      </>
                    ) : (
                      "Shared world"
                    )}
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
                  <Users className="h-4 w-4" /> {p.memberCount}/{p.maxMembers}
                </span>
              </div>
            </section>

            {p.alreadyMember ? (
              <div className="panel px-6 py-10 text-center">
                <p className="text-lg font-bold">You're already in this world</p>
                <Button asChild className="mt-5 h-11 rounded-xl px-6 font-bold">
                  <Link to={`/w/${p.world.id}`}>
                    Enter world <ArrowRight />
                  </Link>
                </Button>
              </div>
            ) : full ? (
              <div className="panel px-6 py-10 text-center">
                <p className="text-lg font-bold">This world is full</p>
                <p className="mt-1 text-sm text-muted-foreground">Shared worlds hold up to {p.maxMembers} players.</p>
              </div>
            ) : (
              <>
                <section className="space-y-5">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">Your persona</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Everyone starts as a nobody, including you. The other players are real; everyone else is a labeled SIM.</p>
                  </div>
                  <AvatarPicker value={avatar} onChange={setAvatar} size={72} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="dn">Display name</Label>
                      <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} placeholder="Alex Chen" className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="un">Username</Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                        <Input id="un" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))} placeholder="alexchen" className="h-11 pl-7" aria-invalid={username.length > 0 && (!usernameOk || taken)} />
                      </div>
                      {username.length > 0 && !usernameOk && <p className="text-xs text-infamy">3–20 letters, numbers or underscores.</p>}
                      {taken && <p className="text-xs text-infamy">Another player already uses that name here.</p>}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} rows={2} placeholder="Building in public. Leveling IRL." />
                  </div>
                  <div>
                    <Label>
                      Interests <span className="font-normal text-muted-foreground">(pick 1–6)</span>
                    </Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[...themeTopics, ...TOPICS.map((t) => t.id).filter((t) => !themeTopics.includes(t))].map((id) => {
                        const on = interests.includes(id);
                        return (
                          <button key={id} type="button" aria-pressed={on} onClick={() => setInterests(on ? interests.filter((i) => i !== id) : interests.length < 6 ? [...interests, id] : interests)} className={cn("rounded-full border px-3.5 py-1.5 text-sm transition-colors", on ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground hover:text-foreground", themeTopics.includes(id) && !on && "border-foreground/20 text-foreground/80")}>
                            {topicName(id)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <Label>Starting condition</Label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {STARTS.map((s) => (
                      <button key={s.id} type="button" aria-pressed={start === s.id} onClick={() => setStart(s.id)} className={cn("relative rounded-2xl border p-4 text-left transition-all", start === s.id ? "border-brand bg-brand/[0.07] ring-1 ring-brand" : "border-border bg-card hover:border-foreground/25")}>
                        {start === s.id && <Check className="absolute right-3 top-3 h-4 w-4 text-brand" />}
                        <s.icon className={cn("mb-2 h-5 w-5", start === s.id && "text-brand")} />
                        <p className="font-semibold">{s.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{s.body}</p>
                      </button>
                    ))}
                  </div>
                  {start === "niche" && interests.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {interests.map((id) => (
                        <button key={id} type="button" aria-pressed={(niche || interests[0]) === id} onClick={() => setNiche(id)} className={cn("rounded-full border px-3.5 py-1.5 text-sm", (niche || interests[0]) === id ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground")}>
                          {topicName(id)}
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                {error && (
                  <div role="alert" className="rounded-xl bg-infamy/10 p-4 text-sm text-infamy">
                    {error}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button onClick={join} disabled={!canJoin} className="h-11 rounded-xl px-6 font-bold">
                    {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />} Join world
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
