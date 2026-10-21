import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Flame, Hash, Loader2, Megaphone, Sparkles, TrendingUp, Users, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, FeedSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { callFn, errorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { WorldEventRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRailOverride } from "@/providers/RailProvider";
import { useWorld } from "@/providers/WorldProvider";

const CATEGORIES: { id: string; label: string; dot: string; icon: typeof Zap; tint: string }[] = [
  { id: "creator", label: "Creator activity", dot: "bg-fame", icon: TrendingUp, tint: "bg-fame/15 text-fame" },
  { id: "trends", label: "Trends", dot: "bg-controversy", icon: Hash, tint: "bg-controversy/15 text-controversy" },
  { id: "conflicts", label: "Conflicts", dot: "bg-infamy", icon: Flame, tint: "bg-infamy/15 text-infamy" },
  { id: "community", label: "Community", dot: "bg-influence", icon: Users, tint: "bg-influence/15 text-influence" },
  { id: "platform", label: "Platform", dot: "bg-credibility", icon: Megaphone, tint: "bg-credibility/15 text-credibility" },
  { id: "reputation", label: "Reputation", dot: "bg-admiration", icon: Sparkles, tint: "bg-admiration/15 text-admiration" },
];
const catOf = (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];

const CHOICE_COPY: Record<string, { label: string; hint: string }> = {
  apologize: { label: "Apologize", hint: "Cools infamy and controversy. Some supporters may be disappointed." },
  stand_firm: { label: "Stand firm", hint: "Rallies your base and raises attention. Neutral observers may tune out." },
  clarify: { label: "Clarify", hint: "Adds credibility and narrows the disagreement." },
  ignore: { label: "Ignore", hint: "Let it fade on its own. Nothing gained, little lost." },
};

type EventFull = WorldEventRow & { related_account_ids: string[] };

function useEvents(worldId: string) {
  return useQuery({
    queryKey: ["events", worldId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("world_events")
        .select("id, event_type, category, title, description, severity, status, involves_player, started_at, player_response, event_data, related_account_ids, related_post_ids")
        .eq("world_id", worldId)
        .order("started_at", { ascending: false })
        .limit(80);
      if (error) throw new Error("Couldn't load world events.");
      const events = (data ?? []) as unknown as EventFull[];
      const ids = [...new Set(events.flatMap((e) => e.related_account_ids))].slice(0, 150);
      const avatars = new Map<string, { username: string; avatar: string }>();
      if (ids.length) {
        const { data: sims } = await supabase.from("simulated_accounts").select("id, username, avatar_reference").in("id", ids);
        (sims ?? []).forEach((s) => avatars.set(s.id, { username: s.username, avatar: s.avatar_reference }));
      }
      return { events, avatars };
    },
    refetchInterval: 45_000,
  });
}

function EventResponse({ event }: { event: EventFull }) {
  const { worldId, refreshSoon } = useWorld();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const choices = event.event_data?.choices ?? [];
  if (!event.involves_player || !choices.length) return null;
  if (event.player_response) {
    return <p className="mt-2 text-[13px] text-muted-foreground">You chose: <b className="text-foreground">{CHOICE_COPY[event.player_response]?.label ?? event.player_response}</b></p>;
  }
  const respond = async (choice: string) => {
    setBusy(choice);
    try {
      const res = await callFn<{ summary: string }>("social", { action: "respond_event", worldId, eventId: event.id, choice });
      toast(res.summary);
      queryClient.invalidateQueries({ queryKey: ["events", worldId] });
      refreshSoon();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
      {choices.map((c) => (
        <Tooltip key={c}>
          <TooltipTrigger asChild>
            <Button size="sm" variant={c === "apologize" || c === "clarify" ? "default" : "secondary"} disabled={!!busy} onClick={() => respond(c)} className="rounded-full">
              {busy === c && <Loader2 className="animate-spin" />}
              {CHOICE_COPY[c]?.label ?? c}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-56">{CHOICE_COPY[c]?.hint}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function Hero({ event, avatars }: { event: EventFull; avatars: Map<string, { username: string; avatar: string }> }) {
  const people = event.related_account_ids.map((id) => avatars.get(id)).filter(Boolean).slice(0, 2) as { username: string; avatar: string }[];
  const cat = catOf(event.category);
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface to-card p-5 sm:p-6" aria-label="Featured event">
      <div className="grain pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <span className={cn("inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium", cat.tint)}>
            <AlertCircle className="h-4 w-4" /> {event.title}
            {event.status === "escalating" && <span>· Escalating</span>}
          </span>
          <p className="mt-4 text-[22px] font-bold leading-snug sm:text-2xl">{event.description}</p>
          <p className="mt-3 text-sm text-muted-foreground">{timeAgo(event.started_at)} ago · Severity {event.severity}/5</p>
          <EventResponse event={event} />
        </div>
        {people.length > 0 && (
          <div className="flex items-center gap-1 self-center">
            {people.map((p, i) => (
              <div key={p.username} className="flex items-center">
                <Avatar seed={p.avatar} size={104} className="rounded-2xl" alt={`@${p.username}`} />
                {i === 0 && people.length > 1 && <Zap className="mx-[-10px] h-14 w-14 rotate-12 fill-controversy text-controversy drop-shadow-[0_0_14px_hsl(var(--controversy)/0.6)]" aria-hidden />}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function Events() {
  const { worldId } = useWorld();
  const q = useEvents(worldId);
  const [filters, setFilters] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    (q.data?.events ?? []).forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + 1));
    return m;
  }, [q.data]);

  const filtered = (q.data?.events ?? []).filter((e) => filters.size === 0 || filters.has(e.category));
  const hero = filtered.find((e) => (e.status === "escalating" || e.status === "active") && e.severity >= 3) ?? filtered[0];
  const rest = filtered.filter((e) => e.id !== hero?.id);
  const mine = (q.data?.events ?? []).filter((e) => e.involves_player).slice(0, 3);

  const toggle = (id: string | "all") => {
    if (id === "all") return setFilters(new Set());
    const next = new Set(filters);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFilters(next);
  };

  const filterPanel = (
    <section className="panel p-4" aria-label="Filter events">
      <h2 className="mb-3 text-lg font-bold">Filter events</h2>
      <ul className="space-y-1">
        <li>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5">
            <Checkbox checked={filters.size === 0} onCheckedChange={() => toggle("all")} />
            <span className="flex-1 font-medium">All events</span>
            <span className="text-sm text-muted-foreground tabular-nums">{q.data?.events.length ?? 0}</span>
          </label>
        </li>
        {CATEGORIES.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5">
              <Checkbox checked={filters.has(c.id)} onCheckedChange={() => toggle(c.id)} />
              <span className="flex-1">{c.label}</span>
              <span className="text-sm text-muted-foreground tabular-nums">{counts.get(c.id) ?? 0}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
  const yours = (
    <section className="panel p-4" aria-label="Your recent moments">
      <h2 className="mb-2 text-lg font-bold">Your moments</h2>
      {mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing involving you yet. The world is going on without you — for now.</p>
      ) : (
        <ul className="divide-y divide-border">
          {mine.map((e) => (
            <li key={e.id} className="py-2.5">
              <p className="text-sm font-medium">{e.title}</p>
              <p className="text-xs text-muted-foreground">{timeAgo(e.started_at)} ago</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  useRailOverride(<>{filterPanel}{yours}</>, [q.data, filters]);

  return (
    <div>
      <PageHeader title="World Events" subtitle="A timeline of what's happening in the simulation." />
      <div className="space-y-4 p-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-none xl:hidden">
          <button type="button" onClick={() => toggle("all")} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", filters.size === 0 ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground")}>
            All
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" onClick={() => toggle(c.id)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", filters.has(c.id) ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground")}>
              {c.label}
            </button>
          ))}
        </div>
        {q.isLoading && <FeedSkeleton count={4} />}
        {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {q.data && !filtered.length && <EmptyState icon={<Zap className="h-5 w-5" />} title="No events here" body="Events appear as the simulation runs: feuds, breakouts, trends and more." />}
        {hero && q.data && <Hero event={hero} avatars={q.data.avatars} />}
        {rest.length > 0 && (
          <ol className="panel relative overflow-hidden py-2" aria-label="Event timeline">
            <span aria-hidden className="absolute bottom-4 left-[92px] top-4 w-px bg-border" />
            {rest.map((e) => {
              const cat = catOf(e.category);
              const people = e.related_account_ids.map((id) => q.data!.avatars.get(id)).filter(Boolean).slice(0, 2) as { username: string; avatar: string }[];
              return (
                <li key={e.id} className="relative flex gap-3 px-4 py-3.5 animate-rise-in">
                  <span className="w-[58px] shrink-0 pt-1 text-right text-[13px] text-muted-foreground">{timeAgo(e.started_at)} ago</span>
                  <span className={cn("relative z-10 mt-2 h-3 w-3 shrink-0 rounded-full ring-4 ring-card", cat.dot)} aria-hidden />
                  {people.length ? (
                    <div className="flex shrink-0 -space-x-3">
                      {people.map((p) => (
                        <Avatar key={p.username} seed={p.avatar} size={48} className="rounded-xl" ring />
                      ))}
                    </div>
                  ) : (
                    <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-xl", e.involves_player ? "bg-brand/15 text-brand" : cat.tint)}>
                      {e.involves_player ? <Sparkles className="h-5 w-5" /> : <cat.icon className="h-5 w-5" />}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{e.title}</span>
                      <span className="rounded-md bg-elevated px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-border">{cat.label}</span>
                      {e.involves_player && <span className="rounded-md bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">You</span>}
                    </p>
                    <p className="mt-0.5 text-[14.5px] text-muted-foreground">{e.description}</p>
                    <EventResponse event={e} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
