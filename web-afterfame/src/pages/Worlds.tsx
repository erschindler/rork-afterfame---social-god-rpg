import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, LogOut, Plus, Users } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { callFn } from "@/lib/api";
import { compact, timeAgo } from "@/lib/format";
import { THEMES } from "@/lib/topics";
import { useAuth } from "@/providers/AuthProvider";

interface WorldListItem {
  id: string;
  name: string;
  world_size: string;
  world_theme: string;
  world_pace: string;
  privacy_mode?: string;
  status: string;
  created_at: string;
  last_simulated_at: string;
  player: { username: string; display_name: string; avatar_reference: string; current_rank: string; follower_count: number; fame: number } | null;
}

export default function Worlds() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState<string>("");
  const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const q = useQuery({ queryKey: ["worlds"], queryFn: () => callFn<{ worlds: WorldListItem[] }>("world", { action: "list" }) });

  if (q.data && q.data.worlds.length === 0) return <Navigate to="/worlds/new" replace />;

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-5 py-8">
      <header className="mb-10 flex items-center justify-between">
        <Logo />
        <Button variant="ghost" onClick={signOut}>
          <LogOut /> Sign out
        </Button>
      </header>
      <h1 className="text-3xl font-bold tracking-tight">Your worlds</h1>
      <p className="mt-1 text-muted-foreground">Signed in as {user?.email}. Each world is its own internet, private or shared with friends.</p>
      {q.isLoading && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      )}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      <ul className="mt-6 space-y-3">
        {q.data?.worlds.map((w) => {
          const theme = THEMES.find((t) => t.id === w.world_theme);
          const ready = w.status === "ready" && w.player;
          return (
            <li key={w.id}>
              <Link to={ready ? `/w/${w.id}` : "/worlds/new"} className="panel group flex items-center gap-4 p-4 transition-colors hover:bg-elevated">
                {w.player ? <Avatar seed={w.player.avatar_reference} size={56} /> : <span className="grid h-14 w-14 place-items-center rounded-full bg-controversy/15 text-controversy"><AlertTriangle /></span>}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-lg font-bold">
                    {w.name}
                    {w.privacy_mode === "shared" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand">
                        <Users className="h-3 w-3" /> Shared
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {theme?.name ?? w.world_theme} · {w.world_size} · {w.world_pace} pace
                  </p>
                  {w.player ? (
                    <p className="mt-1 text-sm">
                      @{w.player.username} · <span className="text-brand">{w.player.current_rank}</span> · {compact(w.player.follower_count)} followers · active {timeAgo(w.last_simulated_at)} ago
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-controversy">Setup was interrupted. Open to resume.</p>
                  )}
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Link>
            </li>
          );
        })}
      </ul>
      {q.data && (
        <Button asChild variant="secondary" className="mt-4 h-12 w-full rounded-2xl border border-dashed border-border bg-transparent">
          <Link to="/worlds/new">
            <Plus /> Create another world
          </Link>
        </Button>
      )}
      {q.data && (
        <form
          className="panel mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            if (cleanCode.length === 8) navigate(`/join/${cleanCode}`);
          }}
        >
          <div className="flex-1">
            <p className="font-semibold">Join a friend's world</p>
            <p className="text-sm text-muted-foreground">Paste the 8-character invite code they shared.</p>
          </div>
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="HW7BGC2B" aria-label="Invite code" className="h-11 w-36 font-mono uppercase tracking-widest" maxLength={12} />
            <Button type="submit" disabled={cleanCode.length !== 8} className="h-11 rounded-xl font-bold">
              Join
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
