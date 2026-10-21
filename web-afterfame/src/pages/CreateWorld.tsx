import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Dices, Globe2, Loader2, Lock, Sparkles, Store, Target, User, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callFn, errorMessage } from "@/lib/api";
import { THEMES, TOPICS, topicName } from "@/lib/topics";
import { cn } from "@/lib/utils";

const STEPS = ["World", "Persona", "Start", "Enter"];
const SIZES = [
  { id: "small", label: "Small", count: "~100 people", note: "Tight-knit. Faces repeat." },
  { id: "standard", label: "Standard", count: "~500 people", note: "Recommended balance." },
  { id: "large", label: "Large", count: "~1,500 people", note: "Big crowds. Slower setup." },
];
const PACES = [
  { id: "relaxed", label: "Relaxed", note: "30 min per world tick" },
  { id: "standard", label: "Standard", note: "15 min per world tick" },
  { id: "fast", label: "Fast", note: "5 min per world tick" },
];
const STARTS = [
  { id: "ordinary", icon: User, title: "Ordinary account", body: "A completely unknown user with a handful of followers. Pure underdog." },
  { id: "niche", icon: Target, title: "Niche enthusiast", body: "A small audience in one topic, with slightly higher credibility there." },
  { id: "creator", icon: Store, title: "Fresh creator", body: "A newly launched creator account with a small starting audience." },
];
const LOADING_LINES = ["Generating fictional people…", "Giving them opinions and grudges…", "Wiring the social graph…", "Seeding conversations and trends…", "Starting the clock…"];

function Choice({ selected, onClick, children, disabled, className }: { selected: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn("relative rounded-2xl border p-4 text-left transition-all", selected ? "border-brand bg-brand/[0.07] ring-1 ring-brand" : "border-border bg-card hover:border-foreground/25", disabled && "cursor-not-allowed opacity-50", className)}
    >
      {selected && <Check className="absolute right-3 top-3 h-4 w-4 text-brand" />}
      {children}
    </button>
  );
}

export default function CreateWorld() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<number>(0);
  const [name, setName] = useState<string>("My Internet");
  const [theme, setTheme] = useState<string>("mixed");
  const [size, setSize] = useState<string>("standard");
  const [pace, setPace] = useState<string>("standard");
  const [displayName, setDisplayName] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [bio, setBio] = useState<string>("");
  const [avatar, setAvatar] = useState<string>(() => `me-${Math.random().toString(36).slice(2, 8)}`);
  const [interests, setInterests] = useState<string[]>([]);
  const [start, setStart] = useState<string>("ordinary");
  const [niche, setNiche] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [line, setLine] = useState<number>(0);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setLine((l) => Math.min(LOADING_LINES.length - 1, l + 1)), 3500);
    return () => clearInterval(t);
  }, [busy]);

  const themeTopics = useMemo(() => THEMES.find((t) => t.id === theme)?.topics ?? [], [theme]);
  const usernameOk = /^[a-z0-9_]{3,20}$/.test(username);
  const canNext = [name.trim().length > 0, displayName.trim().length > 0 && usernameOk && interests.length > 0, true, true][step];

  const create = async () => {
    setBusy(true);
    setError(null);
    setLine(0);
    try {
      const res = await callFn<{ worldId: string }>("world", {
        action: "create", name: name.trim(), size, pace, theme, privacy: "private",
        persona: { displayName: displayName.trim(), username, bio: bio.trim(), avatar, interests, startingCondition: start, nicheTopic: start === "niche" ? niche || interests[0] : null },
      });
      queryClient.invalidateQueries({ queryKey: ["worlds"] });
      navigate(`/w/${res.worldId}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

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
        <ol className="mb-8 flex items-center gap-2" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold", i < step ? "bg-brand text-primary-foreground" : i === step ? "bg-brand/15 text-brand ring-1 ring-brand" : "bg-elevated text-muted-foreground")}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("hidden text-sm sm:block", i === step ? "font-semibold" : "text-muted-foreground")}>{s}</span>
              {i < STEPS.length - 1 && <span className={cn("h-px flex-1", i < step ? "bg-brand" : "bg-border")} />}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="space-y-7 animate-rise-in">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Build your world</h1>
              <p className="mt-1 text-muted-foreground">An internet of fictional people that keeps living when you log off.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wname">World name</Label>
              <Input id="wname" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-11" />
            </div>
            <div>
              <Label>Atmosphere</Label>
              <p className="mb-3 text-sm text-muted-foreground">Shapes who lives here and what they talk about. It doesn't lock your path.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {THEMES.map((t) => (
                  <Choice key={t.id} selected={theme === t.id} onClick={() => setTheme(t.id)}>
                    <p className="font-semibold">{t.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{t.blurb}</p>
                  </Choice>
                ))}
              </div>
            </div>
            <div>
              <Label>Population</Label>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                {SIZES.map((s) => (
                  <Choice key={s.id} selected={size === s.id} onClick={() => setSize(s.id)}>
                    <p className="font-semibold">{s.label}</p>
                    <p className="text-sm text-brand">{s.count}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>
                  </Choice>
                ))}
              </div>
            </div>
            <div>
              <Label>Pace</Label>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                {PACES.map((p) => (
                  <Choice key={p.id} selected={pace === p.id} onClick={() => setPace(p.id)}>
                    <p className="font-semibold">{p.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.note}</p>
                  </Choice>
                ))}
              </div>
            </div>
            <div>
              <Label>Privacy</Label>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <Choice selected onClick={() => undefined}>
                  <Lock className="mb-2 h-5 w-5 text-brand" />
                  <p className="font-semibold">Private world</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Just you and the simulation.</p>
                </Choice>
                <Choice selected={false} disabled onClick={() => undefined}>
                  <Globe2 className="mb-2 h-5 w-5" />
                  <p className="font-semibold">Shared world</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Not open yet</p>
                </Choice>
                <Choice selected={false} disabled onClick={() => undefined}>
                  <Users className="mb-2 h-5 w-5" />
                  <p className="font-semibold">Private circle</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Not open yet</p>
                </Choice>
              </div>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="space-y-6 animate-rise-in">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Your public persona</h1>
              <p className="mt-1 text-muted-foreground">No class, no alignment. Who you become depends on what you do.</p>
            </div>
            <div className="flex items-center gap-4">
              <Avatar seed={avatar} size={88} />
              <Button type="button" variant="secondary" onClick={() => setAvatar(`me-${Math.random().toString(36).slice(2, 8)}`)}>
                <Dices /> Shuffle avatar
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dn">Display name</Label>
                <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} placeholder="Alex Chen" className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="un">Username</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                  <Input id="un" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))} placeholder="alexchen" className="h-11 pl-7" aria-invalid={username.length > 0 && !usernameOk} />
                </div>
                {username.length > 0 && !usernameOk && <p className="text-xs text-infamy">3–20 letters, numbers or underscores.</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} rows={2} placeholder="Building in public. Leveling IRL." />
            </div>
            <div>
              <Label>Interests <span className="font-normal text-muted-foreground">(pick 1–6)</span></Label>
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
        )}

        {step === 2 && (
          <section className="space-y-6 animate-rise-in">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Starting condition</h1>
              <p className="mt-1 text-muted-foreground">None of these make you famous. Nobody starts as a celebrity.</p>
            </div>
            <div className="grid gap-3">
              {STARTS.map((s) => (
                <Choice key={s.id} selected={start === s.id} onClick={() => setStart(s.id)} className="flex gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-elevated text-brand">
                    <s.icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block font-semibold">{s.title}</span>
                    <span className="block text-sm text-muted-foreground">{s.body}</span>
                  </span>
                </Choice>
              ))}
            </div>
            {start === "niche" && (
              <div>
                <Label>Your niche</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {interests.map((id) => (
                    <button key={id} type="button" aria-pressed={(niche || interests[0]) === id} onClick={() => setNiche(id)} className={cn("rounded-full border px-3.5 py-1.5 text-sm", (niche || interests[0]) === id ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground")}>
                      {topicName(id)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {step === 3 && (
          <section className="space-y-6 animate-rise-in">
            {busy ? (
              <div className="panel flex flex-col items-center gap-5 px-6 py-14 text-center" role="status" aria-live="polite">
                <div className="relative">
                  <Avatar seed={avatar} size={88} />
                  <span className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full bg-brand text-primary-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </span>
                </div>
                <div>
                  <p className="text-xl font-bold">{LOADING_LINES[line]}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{SIZES.find((s) => s.id === size)?.count} are moving in. {size === "large" ? "Large worlds take up to a minute." : "This takes a few seconds."}</p>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Ready to enter</h1>
                  <p className="mt-1 text-muted-foreground">You'll arrive as @{username}, a nobody with a few followers. What happens next is up to you — and them.</p>
                </div>
                <div className="panel divide-y divide-border">
                  {[
                    ["World", `${name} · ${THEMES.find((t) => t.id === theme)?.name}`],
                    ["Population", `${SIZES.find((s) => s.id === size)?.count} · ${pace} pace · private`],
                    ["You", `${displayName} (@${username})`],
                    ["Interests", interests.map(topicName).join(", ")],
                    ["Start", STARTS.find((s) => s.id === start)?.title ?? ""],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="text-right font-medium">{v}</span>
                    </div>
                  ))}
                </div>
                {error && (
                  <div role="alert" className="rounded-xl bg-infamy/10 p-4 text-sm text-infamy">
                    {error}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Every other account in your world is fictional and labeled SIM. No real people are simulated.</p>
              </>
            )}
          </section>
        )}

        {!busy && (
          <div className="mt-10 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft /> Back
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="h-11 rounded-xl px-6 font-bold">
                Continue <ArrowRight />
              </Button>
            ) : (
              <Button onClick={create} className="h-11 rounded-xl px-6 font-bold">
                <Sparkles /> {error ? "Retry" : "Create world"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
