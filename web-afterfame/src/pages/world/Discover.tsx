import { useQuery } from "@tanstack/react-query";
import { Flame, Hash, MessagesSquare, Search, Sparkles, TrendingUp, Users, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AccountRow } from "@/components/AccountRow";
import { PageHeader } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";
import { EmptyState, ErrorState, FeedSkeleton } from "@/components/States";
import { callFn } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { topicName } from "@/lib/topics";
import type { AccountCard, CommunityRow, PostView, TrendRow, WorldEventRow } from "@/lib/types";
import { useWorld } from "@/providers/WorldProvider";

interface DiscoverData {
  rising: AccountCard[];
  newCreators: AccountCard[];
  mostDiscussed: PostView[];
  mostDivisive: PostView[];
  trends: TrendRow[];
  communities: CommunityRow[];
  events: WorldEventRow[];
}

interface SearchData {
  accounts: AccountCard[];
  posts: PostView[];
  trends: TrendRow[];
  communities: CommunityRow[];
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b border-border pb-2" aria-label={title}>
      <h2 className="flex items-center gap-2 px-4 pb-1 pt-5 text-lg font-bold">
        <span className="text-brand">{icon}</span> {title}
      </h2>
      {children}
    </section>
  );
}

function SearchResults({ q }: { q: string }) {
  const { worldId, base } = useWorld();
  const s = useQuery({ queryKey: ["search", worldId, q], queryFn: () => callFn<SearchData>("feed", { action: "search", worldId, q }), enabled: q.length >= 2 });
  if (s.isLoading) return <FeedSkeleton count={3} />;
  if (s.error) return <ErrorState error={s.error} onRetry={() => s.refetch()} />;
  const d = s.data;
  if (!d || (!d.accounts.length && !d.posts.length && !d.trends.length && !d.communities.length)) {
    return <EmptyState icon={<Search className="h-5 w-5" />} title={`No results for “${q}”`} body="Try a username, a topic, or a hashtag." />;
  }
  return (
    <div>
      {d.trends.length > 0 && (
        <Section title="Trends" icon={<Hash className="h-5 w-5" />}>
          {d.trends.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="font-bold">{t.name}</span>
              <span className="text-sm text-muted-foreground">{t.post_count} posts · {t.status}</span>
            </div>
          ))}
        </Section>
      )}
      {d.accounts.length > 0 && (
        <Section title="People" icon={<Users className="h-5 w-5" />}>
          {d.accounts.map((a) => <AccountRow key={a.id} account={a} />)}
        </Section>
      )}
      {d.communities.length > 0 && (
        <Section title="Communities" icon={<Users className="h-5 w-5" />}>
          {d.communities.map((c) => (
            <Link key={c.id} to={`${base}/c/${c.slug}`} className="block px-4 py-2.5 hover:bg-elevated/60">
              <p className="font-semibold">{c.name}</p>
              <p className="text-sm text-muted-foreground">{c.description}</p>
            </Link>
          ))}
        </Section>
      )}
      {d.posts.length > 0 && (
        <Section title="Posts" icon={<MessagesSquare className="h-5 w-5" />}>
          {d.posts.map((p) => <PostCard key={p.id} post={p} />)}
        </Section>
      )}
    </div>
  );
}

export default function Discover() {
  const { worldId, base } = useWorld();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [input, setInput] = useState<string>(q);
  useEffect(() => setInput(q), [q]);
  const d = useQuery({ queryKey: ["discover", worldId], queryFn: () => callFn<DiscoverData>("feed", { action: "discover", worldId }), staleTime: 30_000 });

  return (
    <div>
      <PageHeader title="Discover">
        <form
          role="search"
          className="relative px-4 pb-3"
          onSubmit={(e) => {
            e.preventDefault();
            setParams(input.trim() ? { q: input.trim() } : {});
          }}
        >
          <Search className="pointer-events-none absolute left-8 top-[22px] h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search people, posts, #topics, communities"
            aria-label="Search"
            className="h-11 w-full rounded-full border border-border bg-card pl-11 pr-10 text-[15px] placeholder:text-muted-foreground focus:border-brand/60 focus:outline-none"
          />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => setParams({})} className="absolute right-7 top-[22px] -translate-y-1/2 text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </form>
      </PageHeader>
      {q ? (
        <SearchResults q={q} />
      ) : d.isLoading ? (
        <FeedSkeleton count={4} />
      ) : d.error ? (
        <ErrorState error={d.error} onRetry={() => d.refetch()} />
      ) : d.data ? (
        <div>
          <Section title="Trending" icon={<TrendingUp className="h-5 w-5" />}>
            {d.data.trends.length ? (
              <ol>
                {d.data.trends.map((t, i) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setParams({ q: t.name })} className="flex w-full items-center gap-4 px-4 py-2.5 text-left hover:bg-elevated/60">
                      <span className="w-4 text-muted-foreground tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{t.name}</span>
                        <span className="text-[13px] text-muted-foreground">
                          {topicName(t.topic_id)} · {t.post_count} posts · {t.participant_count ?? 0} accounts {t.origin_type === "player" && "· started by a player"}
                        </span>
                      </span>
                      <span className="rounded-full bg-elevated px-2.5 py-0.5 text-xs capitalize text-muted-foreground">{t.status}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-4 pb-3 text-sm text-muted-foreground">No active trends. Start one with a hashtag that people pick up.</p>
            )}
          </Section>
          {d.data.events.length > 0 && (
            <Section title="Major world events" icon={<Zap className="h-5 w-5" />}>
              {d.data.events.map((e) => (
                <Link key={e.id} to={`${base}/events`} className="block px-4 py-2.5 hover:bg-elevated/60">
                  <p className="font-semibold">{e.title} <span className="font-normal text-muted-foreground">· {timeAgo(e.started_at)}</span></p>
                  <p className="text-sm text-muted-foreground">{e.description}</p>
                </Link>
              ))}
            </Section>
          )}
          <Section title="Rising accounts" icon={<Sparkles className="h-5 w-5" />}>
            {d.data.rising.map((a) => <AccountRow key={a.id} account={a} />)}
          </Section>
          {d.data.mostDiscussed.length > 0 && (
            <Section title="Most discussed" icon={<MessagesSquare className="h-5 w-5" />}>
              {d.data.mostDiscussed.map((p) => <PostCard key={p.id} post={p} />)}
            </Section>
          )}
          {d.data.mostDivisive.length > 0 && (
            <Section title="Most divisive" icon={<Flame className="h-5 w-5" />}>
              {d.data.mostDivisive.map((p) => <PostCard key={p.id} post={p} />)}
            </Section>
          )}
          <Section title="New creators" icon={<Sparkles className="h-5 w-5" />}>
            {d.data.newCreators.map((a) => <AccountRow key={a.id} account={a} />)}
          </Section>
          <Section title="Communities" icon={<Users className="h-5 w-5" />}>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {d.data.communities.slice(0, 6).map((c) => (
                <Link key={c.id} to={`${base}/c/${c.slug}`} className="panel p-4 transition-colors hover:bg-elevated">
                  <p className="font-semibold">{c.name}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{c.member_count} members · {topicName(c.topic_id)}</p>
                </Link>
              ))}
            </div>
          </Section>
        </div>
      ) : null}
    </div>
  );
}
