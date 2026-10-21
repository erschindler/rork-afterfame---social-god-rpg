import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, LogOut, Plus } from "lucide-react";
import { Link, Navigate } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
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
  status: string;
  created_at: string;
  last_simulated_at: string;
  player: { username: string; display_name: string; avatar_reference: string; current_rank: string; follower_count: number; fame: number } | null;
}

export default function Worlds() {
  const { signOut, user } = useAuth();
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
      <p className="mt-1 text-muted-foreground">Signed in as {user?.email}. Each world is its own private internet.</p>
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
                  <p className="text-lg font-bold">{w.name}</p>
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
    </div>
  );
}
