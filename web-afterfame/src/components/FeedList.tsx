import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

import { AdCard } from "@/components/AdCard";
import { adForSlot } from "@/lib/ads";

import { EventCard } from "@/components/EventCard";
import { PostCard } from "@/components/PostCard";
import { EmptyState, ErrorState, FeedSkeleton } from "@/components/States";
import { callFn } from "@/lib/api";
import type { FeedItem } from "@/lib/types";
import { useWorld } from "@/providers/WorldProvider";

export type FeedFilter = "for_you" | "following" | "trending" | "latest" | "communities" | "bookmarks";

interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

/** Infinite, cursor-paginated feed with stable de-duplication. */
export function FeedList({ filter, empty }: { filter: FeedFilter; empty?: ReactNode }) {
  const { worldId, player } = useWorld();
  const [hiddenAds, setHiddenAds] = useState<Set<number>>(new Set());
  const adSlots = useRef<Map<number, ReturnType<typeof adForSlot>>>(new Map());
  const showAds = filter !== "bookmarks";
  const adAt = (slot: number) => {
    if (!adSlots.current.has(slot)) adSlots.current.set(slot, adForSlot(`${worldId}:${filter}:${Math.floor(Date.now() / 3_600_000)}`, slot, player?.interests ?? []));
    return adSlots.current.get(slot) ?? null;
  };
  const q = useInfiniteQuery({
    queryKey: ["feed", worldId, filter],
    queryFn: ({ pageParam }) => callFn<FeedPage>("feed", { action: "home", worldId, filter, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 20_000,
  });
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage, q]);

  if (q.isLoading) return <FeedSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const seen = new Set<string>();
  const items = (q.data?.pages ?? []).flatMap((p) => p.items).filter((it) => {
    const key = it.kind === "post" ? `p${it.post?.id}` : `e${it.event?.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!items.length) return <>{empty ?? <EmptyState icon={<Sparkles className="h-5 w-5" />} title="Nothing here yet" body="The world is quiet on this tab. Try another filter or post something." />}</>;

  return (
    <div>
      {items.map((it, i) => {
        const node = it.kind === "post" && it.post ? <PostCard post={it.post} /> : it.event ? <EventCard event={it.event} /> : null;
        const key = it.kind === "post" ? `p${it.post?.id}` : `e${it.event?.id}`;
        // A promoted post after the 4th item, then every 7th.
        const slot = i >= 3 && (i - 3) % 7 === 0 ? (i - 3) / 7 : -1;
        const ad = showAds && slot >= 0 && !hiddenAds.has(slot) ? adAt(slot) : null;
        return (
          <Fragment key={key}>
            {node}
            {ad && <AdCard ad={ad} onHide={() => setHiddenAds((h) => new Set(h).add(slot))} />}
          </Fragment>
        );
      })}
      <div ref={sentinel} className="flex h-20 items-center justify-center text-sm text-muted-foreground">
        {q.isFetchingNextPage ? <Loader2 className="h-5 w-5 animate-spin" /> : q.hasNextPage ? "" : "You're all caught up."}
      </div>
    </div>
  );
}
