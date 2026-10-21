import { ChevronRight, Zap } from "lucide-react";
import { Link } from "react-router-dom";

import { timeAgo } from "@/lib/format";
import type { WorldEventRow } from "@/lib/types";
import { useWorld } from "@/providers/WorldProvider";

/** Inline world-event card in the feed: the world is happening around you. */
export function EventCard({ event }: { event: WorldEventRow }) {
  const { base } = useWorld();
  return (
    <Link
      to={`${base}/events`}
      className="group relative mx-3 my-3 flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-surface px-4 py-4 transition-colors hover:bg-elevated animate-rise-in"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand" />
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-background text-brand">
        <Zap className="h-5 w-5 fill-current" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[15px]">
          <span className="font-bold">World Event</span>
          <span className="text-muted-foreground">· {timeAgo(event.started_at)} ago</span>
        </span>
        <span className="mt-0.5 block text-[15px] leading-snug text-foreground/90">{event.description}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
