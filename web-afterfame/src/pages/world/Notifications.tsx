import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Bell, Flame, Handshake, Hash, Heart, Loader2, MessageCircle, Quote, Repeat2, Sparkles, TrendingUp, UserPlus, Users, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, FeedSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { callFn, errorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { NotificationRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorld } from "@/providers/WorldProvider";

const ICON: Record<string, { icon: typeof Bell; tone: string }> = {
  like: { icon: Heart, tone: "text-infamy" },
  repost: { icon: Repeat2, tone: "text-admiration" },
  reply: { icon: MessageCircle, tone: "text-credibility" },
  quote: { icon: Quote, tone: "text-controversy" },
  mention: { icon: Sparkles, tone: "text-brand" },
  new_follower: { icon: UserPlus, tone: "text-brand" },
  achievement: { icon: Award, tone: "text-fame" },
  fame_milestone: { icon: TrendingUp, tone: "text-fame" },
  trend_participation: { icon: Hash, tone: "text-controversy" },
  relationship_change: { icon: Users, tone: "text-influence" },
  public_controversy: { icon: Flame, tone: "text-infamy" },
  major_event: { icon: Zap, tone: "text-brand" },
  collaboration_invite: { icon: Handshake, tone: "text-brand" },
};

const TABS = [
  { id: "all", label: "All" },
  { id: "important", label: "Important" },
  { id: "mentions", label: "Mentions" },
];

export default function Notifications() {
  const { worldId, base, refreshSoon } = useWorld();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["notifications", worldId],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").eq("world_id", worldId).order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error("Couldn't load notifications.");
      const rows = (data ?? []) as unknown as NotificationRow[];
      const ids = [...new Set(rows.flatMap((r) => r.actor_ids))].slice(0, 150);
      const actors = new Map<string, { username: string; avatar: string }>();
      if (ids.length) {
        const { data: sims } = await supabase.from("simulated_accounts").select("id, username, avatar_reference").in("id", ids);
        (sims ?? []).forEach((s) => actors.set(s.id, { username: s.username, avatar: s.avatar_reference }));
      }
      return { rows, actors };
    },
  });

  useEffect(() => {
    if (!q.data?.rows.some((r) => !r.read_at)) return;
    const t = setTimeout(() => {
      callFn("social", { action: "read_notifications", worldId })
        .then(() => queryClient.invalidateQueries({ queryKey: ["sync", worldId] }))
        .catch(() => undefined);
    }, 1500);
    return () => clearTimeout(t);
  }, [q.data, worldId, queryClient]);

  const collab = async (n: NotificationRow, accept: boolean) => {
    setBusy(n.id);
    try {
      const res = await callFn<{ summary: string }>("social", { action: "respond_collab", worldId, notificationId: n.id, accept });
      toast(res.summary);
      queryClient.invalidateQueries({ queryKey: ["notifications", worldId] });
      refreshSoon();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const rows = (q.data?.rows ?? []).filter((r) => (tab === "important" ? r.priority >= 2 : tab === "mentions" ? ["mention", "reply", "quote"].includes(r.notification_type) : true));

  const open = (n: NotificationRow) => {
    if (n.source_entity_type === "post" && n.source_entity_id) navigate(`${base}/post/${n.source_entity_id}`);
    else if (n.source_entity_type === "event") navigate(`${base}/events`);
    else if (n.notification_type === "achievement") navigate(`${base}/achievements`);
    else if (n.notification_type === "fame_milestone") navigate(`${base}/fame`);
    else if (n.actor_ids[0] && q.data?.actors.get(n.actor_ids[0])) navigate(`${base}/u/${q.data.actors.get(n.actor_ids[0])!.username}`);
  };

  return (
    <div>
      <PageHeader title="Notifications">
        <div role="tablist" className="flex">
          {TABS.map((t) => (
            <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn("relative flex-1 py-3.5 text-[15px] font-medium hover:bg-elevated/60", tab === t.id ? "text-foreground" : "text-muted-foreground")}>
              {t.label}
              {tab === t.id && <span className="absolute bottom-0 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-brand" />}
            </button>
          ))}
        </div>
      </PageHeader>
      {q.isLoading && <FeedSkeleton count={5} />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && rows.length === 0 && <EmptyState icon={<Bell className="h-5 w-5" />} title="Nothing yet" body="When people react to you, it shows up here. Minor reactions are bundled so you only see what matters." />}
      <ul>
        {rows.map((n) => {
          const meta = ICON[n.notification_type] ?? ICON.major_event;
          const actors = n.actor_ids.map((id) => q.data?.actors.get(id)).filter(Boolean).slice(0, 5) as { username: string; avatar: string }[];
          return (
            <li key={n.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => open(n)}
                onKeyDown={(e) => e.key === "Enter" && open(n)}
                className={cn("flex cursor-pointer gap-3 border-b border-border px-4 py-3.5 transition-colors hover:bg-surface", !n.read_at && "bg-brand/[0.04]")}
              >
                <meta.icon className={cn("mt-1 h-6 w-6 shrink-0", meta.tone, (n.notification_type === "like" || n.notification_type === "achievement") && "fill-current")} />
                <div className="min-w-0 flex-1">
                  {actors.length > 0 && (
                    <div className="mb-1.5 flex -space-x-2">
                      {actors.map((a) => (
                        <Avatar key={a.username} seed={a.avatar} size={30} ring />
                      ))}
                    </div>
                  )}
                  <p className="text-[15px]">
                    <span className="font-semibold">{n.title}</span>
                    {n.batch_count > 1 && <span className="text-muted-foreground"> · {n.batch_count} updates</span>}
                  </p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-[14.5px] text-muted-foreground">{n.body}</p>}
                  {n.notification_type === "collaboration_invite" && n.action_state === "pending" && (
                    <div className="mt-2.5 flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" className="rounded-full font-bold" disabled={busy === n.id} onClick={() => collab(n, true)}>
                        {busy === n.id && <Loader2 className="animate-spin" />} Accept collab
                      </Button>
                      <Button size="sm" variant="secondary" className="rounded-full" disabled={busy === n.id} onClick={() => collab(n, false)}>
                        Decline
                      </Button>
                    </div>
                  )}
                  {n.notification_type === "collaboration_invite" && n.action_state && n.action_state !== "pending" && <p className="mt-1 text-xs capitalize text-muted-foreground">{n.action_state}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
                </div>
                {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
