import { ArrowRight, Flame, Heart, MessageCircle, Repeat2, ShieldCheck, Sparkles, Users, Zap } from "lucide-react";
import { Link, Navigate } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";

const PREVIEW = [
  { seed: "mara-preview", name: "Mara Okonkwo", handle: "marabuilds", text: "Shipped the indie launcher after 14 months. Honest numbers: 212 downloads. Thread on what I'd do differently.", stats: [48, 62, 431] },
  { seed: "dex-preview", name: "Dex Hollow", handle: "dexhollow", text: "hot take: speedrun categories with no glitches are just walking simulators", stats: [37, 18, 276] },
  { seed: "priya-preview", name: "Priya Nandakumar", handle: "priyainchips", text: "The cache invalidation bug wasn't the bug. The comment above it was lying.", stats: [12, 34, 198] },
];

const FEATURES = [
  { icon: Users, title: "A living fictional internet", body: "Hundreds of simulated people with their own personalities, goals, grudges and friendships. The world moves even when you're offline." },
  { icon: ShieldCheck, title: "Reputation with receipts", body: "Fame, admiration, infamy, credibility, influence and controversy are separate — and every change has a recorded cause." },
  { icon: Flame, title: "Consequences, not validation", body: "Posts can flop. Feuds can follow you. Apologies help but don't erase history. Nothing is guaranteed." },
];

export default function Landing() {
  const { session, loading } = useAuth();
  if (!loading && session) return <Navigate to="/worlds" replace />;
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden />
      <div className="pointer-events-none absolute -left-40 top-20 h-[420px] w-[420px] rounded-full bg-brand/10 blur-[120px]" aria-hidden />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo tagline={false} size="sm" />
        <Button asChild variant="ghost">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>
      <main className="relative mx-auto grid max-w-6xl gap-14 px-6 pb-20 pt-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-16">
        <section>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[13px] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-brand" /> A social network RPG
          </p>
          <h1 className="font-display text-[44px] font-black leading-[0.98] tracking-tight sm:text-6xl">
            Start as nobody.
            <br />
            <span className="text-brand">Become someone</span>
            <br />
            people talk about.
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">
            AFTERFAME drops you into a persistent simulated internet. Post, reply, start feuds, build alliances. Get loved, get famous, get cancelled, come back. The world remembers.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-12 rounded-xl px-6 text-base font-bold">
              <Link to="/auth?mode=signup">
                Create your world <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="h-12 rounded-xl px-6 text-base">
              <Link to="/auth">I have an account</Link>
            </Button>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">Free to play. No AI subscription needed. Every simulated account is fictional and labeled.</p>
        </section>
        <section aria-label="Preview" className="relative">
          <div className="panel relative rotate-[-1.5deg] overflow-hidden shadow-2xl shadow-black/50">
            {PREVIEW.map((p, i) => (
              <div key={p.handle} className="flex gap-3 border-b border-border px-4 py-4 last:border-0 animate-rise-in" style={{ animationDelay: `${i * 120}ms` }}>
                <Avatar seed={p.seed} size={44} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[15px]">
                    <b>{p.name}</b>
                    <span className="rounded bg-elevated px-1.5 text-[10px] font-bold text-muted-foreground ring-1 ring-border">SIM</span>
                    <span className="text-muted-foreground">@{p.handle}</span>
                  </p>
                  <p className="mt-0.5 text-[15px]">{p.text}</p>
                  <div className="mt-2 flex gap-8 text-[13px] text-muted-foreground">
                    <span className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4" /> {p.stats[0]}</span>
                    <span className="flex items-center gap-1.5"><Repeat2 className="h-4 w-4" /> {p.stats[1]}</span>
                    <span className="flex items-center gap-1.5"><Heart className="h-4 w-4" /> {p.stats[2]}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="panel absolute -bottom-10 -left-4 flex max-w-xs rotate-[2deg] items-center gap-3 border-brand/40 p-4 shadow-xl shadow-black/50 sm:-left-10">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-primary-foreground">
              <Zap className="h-5 w-5 fill-current" />
            </span>
            <p className="text-sm">
              <b>World Event</b> · A debate in Speedrun Hub spread to three creator circles after <span className="text-brand">@dexhollow</span> was quoted.
            </p>
          </div>
        </section>
      </main>
      <section className="relative mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="panel p-5">
            <f.icon className="h-6 w-6 text-brand" />
            <h2 className="mt-3 text-lg font-bold">{f.title}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
