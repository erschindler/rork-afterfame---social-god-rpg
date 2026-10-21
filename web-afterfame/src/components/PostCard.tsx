import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bookmark, Flame, Heart, MessageCircle, MoreHorizontal, Pin, Quote, Repeat2, Trash2, UserRound, VolumeX, Ban, Flag } from "lucide-react";
import { memo, useEffect, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Avatar } from "@/components/Avatar";
import { RichText } from "@/components/RichText";
import { SimBadge } from "@/components/SimBadge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { callFn, errorMessage } from "@/lib/api";
import { compact, fullDate, timeAgo } from "@/lib/format";
import type { PostBase, PostView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useComposer } from "@/providers/ComposerProvider";
import { useWorld } from "@/providers/WorldProvider";

function AuthorLine({ post, compactLine }: { post: PostBase; compactLine?: boolean }) {
  const { base } = useWorld();
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[15px]">
      <Link to={`${base}/u/${post.author.username}`} onClick={(e) => e.stopPropagation()} className="truncate font-bold hover:underline">
        {post.author.display_name}
      </Link>
      {post.author.is_simulated && <SimBadge />}
      <span className="truncate text-muted-foreground">@{post.author.username}</span>
      <span className="text-muted-foreground">·</span>
      <time dateTime={post.created_at} title={fullDate(post.created_at)} className="shrink-0 text-muted-foreground">
        {timeAgo(post.created_at)}
      </time>
      {!compactLine && post.is_viral && (
        <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-controversy/15 px-2 py-0.5 text-[11px] font-semibold text-controversy">
          <Flame className="h-3 w-3" /> Viral
        </span>
      )}
    </div>
  );
}

export function QuotedPost({ post }: { post: PostBase }) {
  const { base } = useWorld();
  const navigate = useNavigate();
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        navigate(`${base}/post/${post.id}`);
      }}
      onKeyDown={(e) => e.key === "Enter" && navigate(`${base}/post/${post.id}`)}
      className="mt-2.5 cursor-pointer rounded-xl border border-border p-3 transition-colors hover:bg-elevated/60"
    >
      <div className="flex items-center gap-2">
        <Avatar seed={post.author.avatar} size={20} />
        <AuthorLine post={post} compactLine />
      </div>
      <RichText text={post.content} className="mt-1 whitespace-pre-wrap break-words text-[14.5px] leading-snug" />
    </div>
  );
}

interface ActionProps {
  icon: typeof Heart;
  count?: number;
  label: string;
  active?: boolean;
  activeClass?: string;
  hoverClass: string;
  onClick?: (e: MouseEvent) => void;
  animate?: boolean;
}

function Action({ icon: Icon, count, label, active, activeClass, hoverClass, onClick, animate }: ActionProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={cn("group/act -ml-2 flex min-h-9 items-center gap-1.5 rounded-full px-2 text-[13px] text-muted-foreground transition-colors", hoverClass, active && activeClass)}
    >
      <span className="grid h-8 w-8 place-items-center rounded-full transition-colors group-hover/act:bg-elevated">
        <Icon className={cn("h-[18px] w-[18px]", active && "fill-current", animate && "animate-pop")} />
      </span>
      {count !== undefined && <span className="tabular-nums">{count > 0 ? compact(count) : ""}</span>}
    </button>
  );
}

interface PostCardProps {
  post: PostView;
  focus?: boolean;
  showThreadLine?: boolean;
  onPinned?: () => void;
}

export const PostCard = memo(function PostCard({ post, focus, showThreadLine }: PostCardProps) {
  const { base, worldId, refreshSoon, player } = useWorld();
  const { openReply, openQuote } = useComposer();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [liked, setLiked] = useState<boolean>(post.viewer.liked);
  const [reposted, setReposted] = useState<boolean>(post.viewer.reposted);
  const [bookmarked, setBookmarked] = useState<boolean>(post.viewer.bookmarked);
  const [likeCount, setLikeCount] = useState<number>(post.like_count);
  const [repostCount, setRepostCount] = useState<number>(post.repost_count);
  const [popped, setPopped] = useState<boolean>(false);

  useEffect(() => {
    setLiked(post.viewer.liked);
    setReposted(post.viewer.reposted);
    setBookmarked(post.viewer.bookmarked);
    setLikeCount(post.like_count);
    setRepostCount(post.repost_count);
  }, [post]);

  const own = post.author.is_self;

  const toggle = async (kind: "like" | "repost" | "bookmark") => {
    const state = kind === "like" ? liked : kind === "repost" ? reposted : bookmarked;
    const next = !state;
    if (kind === "like") {
      setLiked(next);
      setLikeCount((c) => c + (next ? 1 : -1));
      if (next) setPopped(true);
    } else if (kind === "repost") {
      setReposted(next);
      setRepostCount((c) => c + (next ? 1 : -1));
    } else setBookmarked(next);
    try {
      await callFn("social", { action: next ? kind : `un${kind}`, worldId, postId: post.id });
      if (kind === "repost" && next) toast("Reposted to your followers");
      if (kind === "bookmark") {
        toast(next ? "Saved to bookmarks" : "Removed from bookmarks");
        queryClient.invalidateQueries({ queryKey: ["feed", worldId, "bookmarks"] });
      }
    } catch (err) {
      if (kind === "like") {
        setLiked(state);
        setLikeCount((c) => c + (next ? -1 : 1));
      } else if (kind === "repost") {
        setReposted(state);
        setRepostCount((c) => c + (next ? -1 : 1));
      } else setBookmarked(state);
      toast.error(errorMessage(err));
    }
  };

  const moderate = async (action: "mute" | "block") => {
    try {
      await callFn("social", { action, worldId, accountId: post.author.id });
      toast(action === "mute" ? `Muted @${post.author.username}` : `Blocked @${post.author.username}`);
      queryClient.invalidateQueries({ queryKey: ["feed", worldId] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const report = async () => {
    try {
      await callFn("social", { action: "report", worldId, targetType: "post", targetId: post.id, reason: "Reported from post menu" });
      toast("Report received. Thanks for flagging.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async () => {
    try {
      await callFn("social", { action: "delete_post", worldId, postId: post.id });
      toast("Post deleted");
      refreshSoon();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const pin = async () => {
    try {
      await callFn("world", { action: "update_profile", worldId, pinnedPostId: post.id });
      toast("Pinned to your profile");
      queryClient.invalidateQueries({ queryKey: ["profile", worldId] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const open = () => navigate(`${base}/post/${post.id}`);

  return (
    <article
      onClick={focus ? undefined : open}
      onKeyDown={(e) => !focus && e.key === "Enter" && e.target === e.currentTarget && open()}
      tabIndex={focus ? undefined : 0}
      aria-label={`Post by ${post.author.display_name}`}
      className={cn("relative flex gap-3 border-b border-border px-4 pb-2 pt-3.5 transition-colors animate-rise-in", !focus && "cursor-pointer hover:bg-surface/80")}
    >
      {showThreadLine && <span aria-hidden className="absolute bottom-0 left-[37px] top-[60px] w-0.5 bg-border" />}
      <Link to={`${base}/u/${post.author.username}`} onClick={(e) => e.stopPropagation()} className="h-fit rounded-full" aria-label={`${post.author.display_name}'s profile`}>
        <Avatar seed={post.author.avatar} size={focus ? 52 : 44} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <AuthorLine post={post} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="More options" onClick={(e) => e.stopPropagation()} className="-mr-2 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-elevated hover:text-foreground">
                <MoreHorizontal className="h-[18px] w-[18px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onSelect={() => navigate(`${base}/u/${post.author.username}`)}>
                <UserRound /> View @{post.author.username}
              </DropdownMenuItem>
              {own ? (
                <>
                  <DropdownMenuItem onSelect={pin}>
                    <Pin /> Pin to profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={remove} className="text-infamy focus:text-infamy">
                    <Trash2 /> Delete post
                  </DropdownMenuItem>
                </>
              ) : post.author.is_simulated ? (
                <>
                  <DropdownMenuItem onSelect={() => moderate("mute")}>
                    <VolumeX /> Mute @{post.author.username}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => moderate("block")}>
                    <Ban /> Block @{post.author.username}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={report}>
                    <Flag /> Report post
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onSelect={report}>
                  <Flag /> Report post
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {post.parent && !focus && (
          <p className="text-[13px] text-muted-foreground">
            Replying to <span className="text-brand">@{post.parent.username}</span>
          </p>
        )}
        <RichText text={post.content} className={cn("mt-0.5 whitespace-pre-wrap break-words leading-[1.42]", focus ? "text-[21px] leading-snug" : "text-[15.5px]")} />
        {post.quoted && <QuotedPost post={post.quoted} />}
        {own && player && post.spread_stage !== "none" && !focus && (
          <p className="mt-1.5 text-[12px] font-medium text-muted-foreground">
            {post.spread_stage === "faded" ? "Spread finished" : post.spread_stage === "viral" ? "Spreading widely" : post.spread_stage.startsWith("stage") ? "Still spreading…" : ""}
          </p>
        )}
        <div className="mt-1 flex max-w-[460px] items-center justify-between">
          <Action icon={MessageCircle} label="Reply" count={post.reply_count} hoverClass="hover:text-credibility" onClick={() => openReply(post)} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Repost or quote"
                onClick={(e) => e.stopPropagation()}
                className={cn("group/act -ml-2 flex min-h-9 items-center gap-1.5 rounded-full px-2 text-[13px] text-muted-foreground transition-colors hover:text-admiration", reposted && "text-admiration")}
              >
                <span className="grid h-8 w-8 place-items-center rounded-full group-hover/act:bg-elevated">
                  <Repeat2 className="h-[19px] w-[19px]" />
                </span>
                <span className="tabular-nums">{repostCount + post.quote_count > 0 ? compact(repostCount + post.quote_count) : ""}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
              {!own && (
                <DropdownMenuItem onSelect={() => toggle("repost")}>
                  <Repeat2 /> {reposted ? "Undo repost" : "Repost"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => openQuote(post)}>
                <Quote /> Quote post
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Action
            icon={Heart}
            label={liked ? "Unlike" : "Like"}
            count={likeCount}
            active={liked}
            activeClass="text-infamy"
            hoverClass="hover:text-infamy"
            animate={popped && liked}
            onClick={() => (own ? toast("You can't like your own post") : toggle("like"))}
          />
          <span className="hidden items-center gap-1.5 text-[13px] text-muted-foreground sm:flex" title="Accounts that saw this">
            <BarChart3 className="h-[17px] w-[17px]" />
            {post.view_count > 0 ? compact(post.view_count) : ""}
          </span>
          <Action icon={Bookmark} label={bookmarked ? "Remove bookmark" : "Bookmark"} active={bookmarked} activeClass="text-brand" hoverClass="hover:text-brand" onClick={() => toggle("bookmark")} />
        </div>
      </div>
    </article>
  );
});
