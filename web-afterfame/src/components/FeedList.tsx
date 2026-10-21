import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

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
  const { worldId } = useWorld();
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
      {items.map((it) =>
        it.kind === "post" && it.post ? <PostCard key={`p${it.post.id}`} post={it.post} /> : it.event ? <EventCard key={`e${it.event.id}`} event={it.event} /> : null,
      )}
      <div ref={sentinel} className="flex h-20 items-center justify-center text-sm text-muted-foreground">
        {q.isFetchingNextPage ? <Loader2 className="h-5 w-5 animate-spin" /> : q.hasNextPage ? "" : "You're all caught up."}
      </div>
    </div>
  );
}
