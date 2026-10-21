import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessagesSquare, Search, ShieldCheck, Trophy, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { FollowButton } from "@/components/FollowButton";
import { Meter } from "@/components/Meter";
import { SimBadge } from "@/components/SimBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { callFn } from "@/lib/api";
import { compact } from "@/lib/format";
import { topicName } from "@/lib/topics";
import type { SidebarData } from "@/lib/types";
import { useWorld } from "@/providers/WorldProvider";

export function useSidebar() {
  const { worldId } = useWorld();
  return useQuery({
    queryKey: ["sidebar", worldId],
    queryFn: () => callFn<SidebarData>("feed", { action: "sidebar", worldId }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

function Card({ title, action, children }: { title: string; action?: { label: string; to: string }; children: React.ReactNode }) {
  return (
    <section className="panel overflow-hidden" aria-label={title}>
      <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
        <h2 className="text-[17px] font-bold">{title}</h2>
        {action && (
          <Link to={action.to} className="text-sm font-medium text-brand hover:underline">
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function SearchBox() {
  const { base } = useWorld();
  const navigate = useNavigate();
  const [q, setQ] = useState<string>("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) navigate(`${base}/discover?q=${encodeURIComponent(q.trim())}`);
      }}
      className="relative"
    >
      <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search AFTERFAME"
        aria-label="Search people, posts, topics"
        className="h-12 w-full rounded-2xl border border-border bg-card pl-11 pr-4 text-[15px] placeholder:text-muted-foreground focus:border-brand/60 focus:outline-none"
      />
    </form>
  );
}

export function FameCard() {
  const { rank, player, base } = useWorld();
  if (!rank || !player) return null;
  const fameReq = rank.requirements.find((r) => r.label === "Fame");
  return (
    <Card title="Your Fame" action={{ label: "View details", to: `${base}/fame` }}>
      <div className="flex gap-3.5 px-4 pb-4 pt-2">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-border bg-background text-brand">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[28px] font-bold leading-none tabular-nums">{Math.round(player.fame)}</span>
            <span className="text-muted-foreground">/ {fameReq?.target ?? 100}</span>
          </div>
          <Meter value={player.fame} max={fameReq?.target ?? 100} className="mt-2.5" label="Fame progress" />
          <p className="mt-2.5 font-medium">{rank.next ? `Next: ${rank.next}` : rank.rank}</p>
          <p className="text-[13px] text-muted-foreground">
            {rank.next ? `${rank.requirements.filter((r) => r.met).length} of ${rank.requirements.length} requirements met.` : "You've reached the top rank."}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function RightRail() {
  const { base } = useWorld();
  const { data, isLoading } = useSidebar();
  return (
    <aside className="sticky top-0 flex h-dvh flex-col gap-4 overflow-y-auto px-1 pb-8 pt-4 scrollbar-none [&>*]:shrink-0" aria-label="World activity">
      <SearchBox />
      <Card title="Trending" action={{ label: "See all", to: `${base}/discover` }}>
        {isLoading ? (
          <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : data?.trends.length ? (
          <ol className="pb-2">
            {data.trends.map((t, i) => (
              <li key={t.id}>
                <Link to={`${base}/discover?q=${encodeURIComponent(t.name)}`} className="flex items-center gap-4 px-4 py-2.5 transition-colors hover:bg-elevated">
                  <span className="w-3 text-lg font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{t.name}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {t.post_count} posts · {topicName(t.topic_id)}
                    </span>
                  </span>
                  {(t.status === "rising" || t.status === "emerging") && <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand">{t.status === "rising" ? "Rising" : "New"}</span>}
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Nothing is trending right now. Trends emerge when enough people pick up the same hashtag.</p>
        )}
      </Card>
      <FameCard />
      {data && data.suggestions.length > 0 && (
        <Card title="Who to follow" action={{ label: "See all", to: `${base}/discover` }}>
          <ul className="pb-2">
            {data.suggestions.map((a) => (
              <li key={a.id}>
                <Link to={`${base}/u/${a.username}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-elevated">
                  <Avatar seed={a.avatar} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-bold">{a.display_name}</span>
                      <SimBadge />
                    </span>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      @{a.username} · {compact(a.followers)}
                    </span>
                  </span>
                  <FollowButton accountId={a.id} username={a.username} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {data && data.challenges.length > 0 && (
        <section className="panel p-4" aria-label="Daily challenges">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-border bg-background text-brand">
              <Trophy className="h-5 w-5" />
            </span>
            <h2 className="font-bold">Daily challenges</h2>
          </div>
          <ul className="space-y-3">
            {data.challenges.map((c) => (
              <li key={c.id}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className={c.completed_at ? "text-muted-foreground line-through" : ""}>{c.description}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {c.progress} / {c.target}
                  </span>
                </div>
                <Meter value={c.progress} max={c.target} className="mt-1.5 h-1.5" label={c.title} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {data && data.debates.length > 0 && (
        <Card title="Popular debates">
          <ul className="pb-2">
            {data.debates.map((d) => (
              <li key={d.id}>
                <Link to={`${base}/post/${d.id}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-elevated">
                  <MessagesSquare className="mt-0.5 h-4 w-4 shrink-0 text-controversy" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm">{d.content}</span>
                    <span className="text-xs text-muted-foreground">{d.reply_count} replies</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {data && data.communities.length > 0 && (
        <Card title="Communities to explore" action={{ label: "All", to: `${base}/communities` }}>
          <ul className="pb-2">
            {data.communities.map((c) => (
              <li key={c.id}>
                <Link to={`${base}/c/${c.slug}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-elevated">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-elevated text-influence">
                    <Users className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.member_count} members</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="px-2 text-[11px] leading-relaxed text-muted-foreground">
        Every account marked SIM is a fictional, simulated person. AFTERFAME is a game; nothing here is real social media.
      </p>
    </aside>
  );
}
