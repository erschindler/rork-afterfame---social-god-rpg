import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Flame, Info, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";

import { Meter } from "@/components/Meter";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/States";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ATTRS, attrMeta, RANK_COPY, SECONDARY } from "@/lib/attributes";
import { compact, one, shortDate, timeAgo } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { PlayerState, RankInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRailOverride } from "@/providers/RailProvider";
import { useWorld } from "@/providers/WorldProvider";

interface HistoryRow {
  id: string;
  attribute_name: string;
  delta: number;
  new_value: number;
  reason: string;
  created_at: string;
  source_post_id: string | null;
}

interface Snapshot {
  fame: number;
  admiration: number;
  infamy: number;
  credibility: number;
  followers: number;
  label: string | null;
  created_at: string;
}

const RANGES = [
  { id: "7d", label: "7D", ms: 7 * 86_400_000 },
  { id: "30d", label: "30D", ms: 30 * 86_400_000 },
  { id: "90d", label: "90D", ms: 90 * 86_400_000 },
  { id: "all", label: "All", ms: Infinity },
];

function useFameData(playerId: string | undefined, worldId: string) {
  return useQuery({
    queryKey: ["fame", playerId],
    enabled: !!playerId,
    queryFn: async () => {
      const [hist, snaps, top, events] = await Promise.all([
        supabase.from("reputation_history").select("id, attribute_name, delta, new_value, reason, created_at, source_post_id").eq("player_id", playerId!).order("created_at", { ascending: false }).limit(60),
        supabase.from("fame_snapshots").select("fame, admiration, infamy, credibility, followers, label, created_at").eq("player_id", playerId!).order("created_at", { ascending: true }).limit(600),
        supabase.from("posts").select("id, content, view_count, like_count, repost_count, is_viral, created_at").eq("author_player_id", playerId!).is("deleted_at", null).order("view_count", { ascending: false }).limit(5),
        supabase.from("world_events").select("id, title, description, event_type, started_at, status").eq("world_id", worldId).eq("involves_player", true).in("event_type", ["public_backlash", "public_feud", "controversial_statement"]).order("started_at", { ascending: false }).limit(5),
      ]);
      for (const r of [hist, snaps, top, events]) if (r.error) throw new Error("Couldn't load your reputation data.");
      return {
        history: (hist.data ?? []) as HistoryRow[],
        snapshots: (snaps.data ?? []) as Snapshot[],
        topPosts: top.data ?? [],
        controversies: events.data ?? [],
      };
    },
    refetchInterval: 45_000,
  });
}

function NextRankPanel({ rank }: { rank: RankInfo }) {
  return (
    <section className="panel p-4" aria-label="Next rank">
      <h2 className="mb-3 text-lg font-bold">{rank.next ? <>Next rank: <span className="text-brand">{rank.next}</span></> : "Top rank reached"}</h2>
      <ul className="space-y-4">
        {rank.requirements.map((r) => (
          <li key={r.label} className="flex gap-3">
            {r.met ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2 text-sm">
                <span>{r.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {compact(r.current)} / {compact(r.target)}
                </span>
              </div>
              <Meter value={r.current} max={r.target} className="mt-1.5" label={r.label} />
            </div>
          </li>
        ))}
      </ul>
      {rank.next && <p className="mt-4 text-xs text-muted-foreground">Ranks need every condition at once. Followers alone won't get you there.</p>}
    </section>
  );
}

function SummaryPanel({ player }: { player: PlayerState }) {
  const stats = [
    { label: "Followers", value: player.follower_count },
    { label: "Posts", value: player.post_count },
    { label: "Total reach", value: player.total_reach },
    { label: "Viral posts", value: player.viral_posts },
  ];
  return (
    <section className="panel p-4" aria-label="Fame summary">
      <h2 className="mb-3 text-lg font-bold">Fame summary</h2>
      <div className="grid grid-cols-2 gap-y-4">
        {stats.map((s, i) => (
          <div key={s.label} className={cn(i % 2 === 1 && "border-l border-border pl-4")}>
            <div className="text-[28px] font-bold leading-none tabular-nums">{compact(s.value)}</div>
            <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
      {player.career_identity.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-background/50 p-3">
          <p className="text-[13px] text-muted-foreground">People see you as</p>
          <p className="mt-0.5 font-semibold">{player.career_identity.join(" · ")}</p>
        </div>
      )}
    </section>
  );
}

function RecentChanges({ history, base }: { history: HistoryRow[]; base: string }) {
  return (
    <section className="panel p-4" aria-label="Recent changes">
      <h2 className="mb-2 text-lg font-bold">Recent changes</h2>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No changes yet. Post something and watch what moves.</p>
      ) : (
        <ul className="divide-y divide-border">
          {history.slice(0, 6).map((h) => {
            const m = attrMeta(h.attribute_name);
            const Icon = m?.icon ?? Sparkles;
            return (
              <li key={h.id} className="flex items-center gap-3 py-2.5">
                <Icon className={cn("h-4 w-4 shrink-0", "text" in (m ?? {}) ? (m as { text: string }).text : "")} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{m?.label ?? h.attribute_name}</span>{" "}
                  <span className={cn("font-semibold tabular-nums", h.delta >= 0 ? (h.attribute_name === "infamy" || h.attribute_name === "controversy" ? "text-infamy" : "text-brand") : "text-infamy")}>
                    {h.delta > 0 ? "+" : ""}
                    {one(h.delta)}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{timeAgo(h.created_at)}</span>
              </li>
            );
          })}
        </ul>
      )}
      <Link to={`${base}/relationships`} className="mt-3 block text-sm font-medium text-brand hover:underline">
        See your relationships →
      </Link>
    </section>
  );
}

export default function Fame() {
  const { player, rank, base, worldId } = useWorld();
  const q = useFameData(player?.id, worldId);
  const [range, setRange] = useState<string>("30d");

  const chart = useMemo(() => {
    const r = RANGES.find((x) => x.id === range)!;
    const since = Date.now() - r.ms;
    const rows = (q.data?.snapshots ?? []).filter((s) => Date.parse(s.created_at) >= since);
    const spanMs = rows.length ? Date.parse(rows[rows.length - 1].created_at) - Date.parse(rows[0].created_at) : 0;
    const fmt = (iso: string) =>
      spanMs < 2 * 86_400_000
        ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return rows.map((s, i) => ({ i, t: Date.parse(s.created_at), fame: Math.round(s.fame * 10) / 10, label: s.label, date: `${fmt(s.created_at)}#${i}` }));
  }, [q.data, range]);

  useRailOverride(
    player && rank ? (
      <>
        <SummaryPanel player={player} />
        <NextRankPanel rank={rank} />
        <RecentChanges history={q.data?.history ?? []} base={base} />
      </>
    ) : null,
    [player, rank, q.data],
  );

  if (!player || !rank) return null;
  const reqs = rank.requirements.slice(0, 2);

  return (
    <div>
      <PageHeader title="Fame & Reputation" subtitle={`${player.current_rank} · Notoriety: ${player.notoriety_rank}`} />
      <div className="space-y-4 p-4">
        <section className="panel overflow-hidden">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full border border-border bg-background text-brand">
              <ShieldCheck className="h-10 w-10" strokeWidth={1.6} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">Your current rank</p>
              <h2 className="font-display text-4xl font-extrabold tracking-tight">{rank.rank}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{RANK_COPY[rank.rank]}</p>
            </div>
            {rank.next && (
              <div className="sm:max-w-[200px]">
                <p className="text-lg">
                  Next: <span className="font-bold text-brand">{rank.next}</span>
                </p>
                <p className="text-[13px] text-muted-foreground">Meet every requirement to climb.</p>
              </div>
            )}
          </div>
          {reqs.length > 0 && (
            <div className="grid border-t border-border sm:grid-cols-2">
              {reqs.map((r, i) => (
                <div key={r.label} className={cn("px-5 py-3.5", i === 1 && "border-t border-border sm:border-l sm:border-t-0")}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{r.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {compact(r.current)} / {compact(r.target)}
                    </span>
                  </div>
                  <Meter value={r.current} max={r.target} className="mt-2" label={r.label} />
                </div>
              ))}
            </div>
          )}
        </section>

        {player.notoriety_rank !== "Unknown" && (
          <div className="flex items-center gap-3 rounded-2xl border border-infamy/30 bg-infamy/5 p-4 text-sm">
            <Flame className="h-5 w-5 text-infamy" />
            <span>
              Parallel notoriety: <b className="text-infamy">{player.notoriety_rank}</b>. Infamy brings attention and closes doors.
            </span>
          </div>
        )}

        <section className="panel p-4" aria-label="Fame over time">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Fame over time</h2>
            <div role="tablist" className="flex rounded-lg bg-background p-0.5 ring-1 ring-border">
              {RANGES.map((r) => (
                <button key={r.id} role="tab" type="button" aria-selected={range === r.id} onClick={() => setRange(r.id)} className={cn("rounded-md px-3 py-1 text-sm transition-colors", range === r.id ? "bg-elevated font-semibold" : "text-muted-foreground hover:text-foreground")}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {q.isLoading ? (
            <Skeleton className="h-56" />
          ) : chart.length < 2 ? (
            <div className="grid h-56 place-items-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
              <p className="max-w-xs">Your fame history builds as the world reacts to you. Come back after a few posts.</p>
            </div>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 24, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fameFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--fame))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--fame))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v: string) => v.split("#")[0]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickLine={false} axisLine={false} domain={[0, (max: number) => Math.max(10, Math.ceil(max * 1.2))]} />
                  <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10 }} labelStyle={{ color: "hsl(var(--muted-foreground))" }} labelFormatter={(v: string) => String(v).split("#")[0]} formatter={(v: number) => [v, "Fame"]} />
                  <Area type="monotone" dataKey="fame" stroke="hsl(var(--fame))" strokeWidth={2.5} fill="url(#fameFill)" isAnimationActive />
                  {chart.filter((c) => c.label).slice(-4).map((c) => (
                    <ReferenceDot key={c.i} x={c.date} y={c.fame} r={5} fill="hsl(var(--controversy))" stroke="hsl(var(--background))" strokeWidth={2} label={{ value: c.label ?? "", position: "top", fill: "hsl(var(--foreground))", fontSize: 11 }} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section aria-label="Attributes" className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {ATTRS.map((a) => {
            const v = Number(player[a.key as keyof PlayerState] ?? 0);
            return (
              <Tooltip key={a.key}>
                <TooltipTrigger asChild>
                  <div className="panel flex items-center gap-3 p-4 text-left">
                    <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-background", a.text)}>
                      <a.icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{a.label}</p>
                      <p className="text-2xl font-bold leading-tight tabular-nums">{Math.round(v)}</p>
                      <Meter value={v} tone={a.tone} className="mt-1.5" label={a.label} />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-56">{a.blurb}</TooltipContent>
              </Tooltip>
            );
          })}
        </section>
        <section className="grid grid-cols-3 gap-3" aria-label="Secondary attributes">
          {SECONDARY.map((s) => (
            <div key={s.key} className="rounded-xl border border-border p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <s.icon className="h-3.5 w-3.5" /> {s.label}
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums">{Math.round(Number(player[s.key as keyof PlayerState] ?? 0))}</p>
            </div>
          ))}
        </section>

        <div className="space-y-4 xl:hidden">
          <SummaryPanel player={player} />
          <NextRankPanel rank={rank} />
        </div>

        <section className="panel overflow-hidden" aria-label="Reputation history">
          <div className="flex items-center gap-2 px-4 pb-2 pt-4">
            <h2 className="text-xl font-bold">Reputation history</h2>
            <Tooltip>
              <TooltipTrigger aria-label="About reputation history" className="text-muted-foreground"><Info className="h-4 w-4" /></TooltipTrigger>
              <TooltipContent className="max-w-60">Every change has a recorded cause. Nothing moves without a reason.</TooltipContent>
            </Tooltip>
          </div>
          {q.error ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-surface text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Attribute</th>
                    <th scope="col" className="px-2 py-2.5 font-medium">Change</th>
                    <th scope="col" className="px-2 py-2.5 font-medium">Reason</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(q.data?.history ?? []).slice(0, 25).map((h) => {
                    const m = attrMeta(h.attribute_name);
                    const Icon = m?.icon ?? Sparkles;
                    const bad = h.attribute_name === "infamy" || h.attribute_name === "controversy" ? h.delta > 0 : h.delta < 0;
                    return (
                      <tr key={h.id} className="border-t border-border">
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2">
                            <Icon className={cn("h-4 w-4", (m as { text?: string })?.text)} /> {m?.label ?? h.attribute_name}
                          </span>
                        </td>
                        <td className={cn("px-2 py-2.5 font-semibold tabular-nums", bad ? "text-infamy" : "text-brand")}>
                          {h.delta > 0 ? "+" : ""}
                          {one(h.delta)}
                        </td>
                        <td className="px-2 py-2.5">
                          {h.source_post_id ? (
                            <Link to={`${base}/post/${h.source_post_id}`} className="hover:underline">
                              {h.reason}
                            </Link>
                          ) : (
                            h.reason
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-muted-foreground">{shortDate(h.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {q.data && q.data.history.length === 0 && <p className="px-4 pb-5 text-sm text-muted-foreground">Nothing yet. Your reputation will start moving once people react to you.</p>}
            </div>
          )}
        </section>

        {q.data && q.data.topPosts.length > 0 && (
          <section className="panel p-4" aria-label="Most influential posts">
            <h2 className="mb-2 text-lg font-bold">Most influential posts</h2>
            <ul className="divide-y divide-border">
              {q.data.topPosts.map((p) => (
                <li key={p.id}>
                  <Link to={`${base}/post/${p.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand">
                    <span className="line-clamp-1 text-sm">{p.content}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{compact(p.view_count)} reached</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {q.data && q.data.controversies.length > 0 && (
          <section className="panel p-4" aria-label="Biggest controversies">
            <h2 className="mb-2 text-lg font-bold">Biggest controversies</h2>
            <ul className="divide-y divide-border">
              {q.data.controversies.map((e) => (
                <li key={e.id} className="py-2.5 text-sm">
                  <p className="font-medium">{e.title}</p>
                  <p className="text-muted-foreground">{e.description}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="xl:hidden">
          <RecentChanges history={q.data?.history ?? []} base={base} />
        </div>
      </div>
    </div>
  );
}
