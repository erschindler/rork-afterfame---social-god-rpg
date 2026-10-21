import { useQuery } from "@tanstack/react-query";
import { Clock, Eye, Globe2, Heart, Info, MessageCircle, Quote, Repeat2, TrendingUp, Users } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { ComposerBox } from "@/components/Composer";
import { FollowButton } from "@/components/FollowButton";
import { PageHeader } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";
import { SimBadge } from "@/components/SimBadge";
import { EmptyState, ErrorState, FeedSkeleton } from "@/components/States";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { callFn } from "@/lib/api";
import { compact, fullDate } from "@/lib/format";
import type { PostView, SpreadRow, ThreadResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRailOverride } from "@/providers/RailProvider";
import { useWorld } from "@/providers/WorldProvider";

const STAGE_STYLE: Record<string, { icon: typeof Eye; tone: string }> = {
  stage1: { icon: Eye, tone: "text-fame border-fame" },
  engagement1: { icon: Heart, tone: "text-fame border-fame" },
  notable: { icon: Quote, tone: "text-controversy border-controversy" },
  stage2: { icon: Users, tone: "text-controversy border-controversy" },
  engagement2: { icon: Heart, tone: "text-controversy border-controversy" },
  stage3: { icon: Globe2, tone: "text-influence border-influence" },
  engagement3: { icon: Heart, tone: "text-influence border-influence" },
  faded: { icon: Clock, tone: "text-muted-foreground border-muted-foreground" },
};

function SpreadPanel({ spread, comparison, post }: { spread: SpreadRow[]; comparison: string | null; post: PostView }) {
  const isOwn = post.author.is_self;
  return (
    <section className="panel p-4" aria-label="Spread analysis">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Spread Analysis</h2>
        <Tooltip>
          <TooltipTrigger aria-label="About spread analysis" className="text-muted-foreground">
            <Info className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent className="max-w-60">How this post traveled through the simulated network, stage by stage. Most posts never pass stage one.</TooltipContent>
        </Tooltip>
      </div>
      {spread.length === 0 ? (
        <p className="text-sm text-muted-foreground">{isOwn ? "Your post is being shown to its first audience. Check back in a moment." : "No distribution data — spread is tracked for player posts."}</p>
      ) : (
        <ol className="relative">
          {spread.map((s, i) => {
            const st = STAGE_STYLE[s.stage] ?? STAGE_STYLE.stage1;
            return (
              <li key={s.stage} className="relative flex gap-3 pb-5 last:pb-0 animate-rise-in" style={{ animationDelay: `${i * 70}ms` }}>
                {i < spread.length - 1 && <span aria-hidden className="absolute left-[21px] top-11 h-[calc(100%-36px)] w-0.5 bg-border" />}
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 bg-background", st.tone)}>
                  <st.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold leading-tight">{s.label}</p>
                    {s.count > 0 && <span className="text-lg font-bold tabular-nums">{compact(s.count)}</span>}
                  </div>
                  <p className="text-[13px] text-muted-foreground">{s.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {comparison && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-elevated p-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-background text-brand">
            <TrendingUp className="h-4 w-4" />
          </span>
          <p className="text-sm">{comparison}</p>
        </div>
      )}
    </section>
  );
}

function AuthorPanel({ post }: { post: PostView }) {
  const { base } = useWorld();
  const a = post.author;
  return (
    <section className="panel p-4" aria-label="Post author">
      <h2 className="mb-3 text-lg font-bold">Post Author</h2>
      <Link to={`${base}/u/${a.username}`} className="flex items-center gap-3">
        <Avatar seed={a.avatar} size={56} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-bold">{a.display_name}</span>
            {a.is_simulated && <SimBadge />}
          </div>
          <div className="text-sm text-muted-foreground">@{a.username}</div>
          <div className="text-xs text-muted-foreground">{a.label}</div>
        </div>
      </Link>
      {a.bio && <p className="mt-3 text-sm text-foreground/85">{a.bio}</p>}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm">
          <b className="tabular-nums">{compact(a.followers)}</b> <span className="text-muted-foreground">followers</span>
        </span>
        {a.is_simulated && <FollowButton accountId={a.id} username={a.username} />}
        {a.is_self && (
          <Link to={`${base}/u/${a.username}`} className="rounded-full bg-elevated px-4 py-1.5 text-sm font-semibold hover:bg-secondary">
            View profile
          </Link>
        )}
      </div>
    </section>
  );
}

export default function Thread() {
  const { postId = "" } = useParams();
  const { worldId } = useWorld();
  const [sort, setSort] = useState<"relevant" | "recent">("relevant");
  const q = useQuery({
    queryKey: ["thread", worldId, postId, sort],
    queryFn: () => callFn<ThreadResponse>("feed", { action: "thread", worldId, postId, sort }),
    refetchInterval: 20_000,
  });
  const data = q.data;

  useRailOverride(
    data ? (
      <>
        <AuthorPanel post={data.post} />
        <SpreadPanel spread={data.spread} comparison={data.comparison} post={data.post} />
      </>
    ) : null,
    [data],
  );

  return (
    <div>
      <PageHeader title="Post" back />
      {q.isLoading && <FeedSkeleton count={3} />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {data && (
        <>
          {data.ancestorsMissing && <p className="border-b border-border px-4 py-3 text-sm text-muted-foreground">The post this replies to is no longer available.</p>}
          {data.ancestors.map((a) => (
            <PostCard key={a.id} post={a} showThreadLine />
          ))}
          <PostCard post={data.post} focus />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border px-4 py-3 text-[15px]">
            <span className="text-muted-foreground">{fullDate(data.post.created_at)}</span>
            <span className="flex items-center gap-1.5"><Heart className="h-4 w-4 text-infamy" /><b className="tabular-nums">{compact(data.post.like_count)}</b> likes</span>
            <span className="flex items-center gap-1.5"><Repeat2 className="h-4 w-4 text-admiration" /><b className="tabular-nums">{compact(data.post.repost_count)}</b> reposts</span>
            <span className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4 text-credibility" /><b className="tabular-nums">{compact(data.post.reply_count)}</b> replies</span>
            {data.post.quote_count > 0 && <span className="flex items-center gap-1.5"><Quote className="h-4 w-4" /><b>{data.post.quote_count}</b> quotes</span>}
          </div>
          <div className="space-y-4 border-b border-border p-4 xl:hidden">
            <SpreadPanel spread={data.spread} comparison={data.comparison} post={data.post} />
          </div>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-bold">Replies ({data.replies.length})</h2>
            <Select value={sort} onValueChange={(v) => setSort(v as "relevant" | "recent")}>
              <SelectTrigger className="h-8 w-auto gap-2 border-none bg-transparent text-sm text-muted-foreground" aria-label="Sort replies">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevant">Most relevant</SelectItem>
                <SelectItem value="recent">Most recent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {data.replies.length === 0 ? (
            <EmptyState title="No replies yet" body={data.post.author.is_self ? "People may still respond — reactions arrive over time." : "Be the first to reply."} />
          ) : (
            data.replies.map((r) => <PostCard key={r.id} post={r} />)
          )}
          {data.quotes.length > 0 && (
            <>
              <h2 className="border-b border-border px-4 py-3 font-bold">Quote posts</h2>
              {data.quotes.map((r) => (
                <PostCard key={r.id} post={r} />
              ))}
            </>
          )}
          <div className="sticky bottom-[76px] border-t border-border bg-background/95 p-4 backdrop-blur-md lg:bottom-0">
            <ComposerBox key={data.post.id} mode={{ kind: "reply", target: data.post }} />
          </div>
        </>
      )}
    </div>
  );
}
