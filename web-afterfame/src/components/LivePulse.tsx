import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

import { callFn } from "@/lib/api";
import type { PulseResponse } from "@/lib/types";
import { useWorld } from "@/providers/WorldProvider";

/**
 * Live strip for the home feed: who is around right now, plus a
 * "new posts" pill that pulls fresh posts in without a jarring reflow.
 */
export function LivePulse({ resetKey }: { resetKey: string }) {
  const { worldId } = useWorld();
  const queryClient = useQueryClient();
  const [since, setSince] = useState<string>(() => new Date().toISOString());

  useEffect(() => setSince(new Date().toISOString()), [resetKey]);

  const q = useQuery({
    queryKey: ["pulse", worldId, since],
    queryFn: () => callFn<PulseResponse>("feed", { action: "pulse", worldId, since }),
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
    staleTime: 6_000,
  });
  const p = q.data;

  const showNew = () => {
    setSince(new Date().toISOString());
    queryClient.invalidateQueries({ queryKey: ["feed", worldId] });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-[12.5px] text-muted-foreground" aria-live="polite">
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
        </span>
        <span className="font-semibold uppercase tracking-wider text-brand">Live</span>
        {p ? (
          <span className="truncate">
            <b className="text-foreground tabular-nums">{p.active_accounts}</b> accounts posting now
            {p.online_players > 1 && (
              <>
                {" "}· <b className="text-foreground tabular-nums">{p.online_players}</b> players online
              </>
            )}
          </span>
        ) : (
          <span>Listening to the world…</span>
        )}
      </div>
      {p && p.new_posts > 0 && (
        <div className="pointer-events-none sticky top-[118px] z-20 flex h-0 justify-center overflow-visible lg:top-[62px]">
          <button
            type="button"
            onClick={showNew}
            className="pointer-events-auto mt-2 flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg shadow-black/40 transition-transform animate-rise-in active:scale-95"
          >
            <ArrowUp className="h-4 w-4" />
            {p.new_posts > 99 ? "99+" : p.new_posts} new {p.new_posts === 1 ? "post" : "posts"}
          </button>
        </div>
      )}
    </>
  );
}
