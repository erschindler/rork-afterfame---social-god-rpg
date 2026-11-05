import createContextHook from "@nkzw/create-context-hook";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { callFn } from "@/lib/api";
import { getNotifyPrefs, playBlip } from "@/lib/notifyPrefs";
import { supabase } from "@/lib/supabase";
import type { OfflineSummary, SyncResponse } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";

interface NotifRealtimeRow {
  id: string;
  world_id: string;
  title: string;
  body: string | null;
  priority: number;
  notification_type: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * Per-world session: syncs the world (which also runs bounded catch-up on the
 * server), exposes the player's state, and listens for new notifications.
 */
export const [WorldProvider, useWorld] = createContextHook(() => {
  const params = useParams<{ worldId: string }>();
  const worldId = params.worldId ?? "";
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState<OfflineSummary | null>(null);
  const firstSync = useRef<boolean>(true);

  const sync = useQuery({
    queryKey: ["sync", worldId],
    queryFn: async () => {
      const includeSummary = firstSync.current;
      firstSync.current = false;
      const res = await callFn<SyncResponse>("world", { action: "sync", worldId, includeSummary });
      if (res.summary) setSummary(res.summary);
      return res;
    },
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    retry: 1,
  });

  // Realtime: new notifications for this user in this world (inserts, and batched rows bumped by updates).
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const alerted = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!user) return;
    const base = `/w/${worldId}`;
    const handle = (row: NotifRealtimeRow, isInsert: boolean) => {
      if (row.world_id !== worldId) return;
      queryClient.invalidateQueries({ queryKey: ["sync", worldId] });
      queryClient.invalidateQueries({ queryKey: ["notifications", worldId] });
      queryClient.invalidateQueries({ queryKey: ["sidebar", worldId] });
      if (row.read_at || Date.now() - new Date(row.created_at).getTime() > 60_000) return;
      // An update re-fires for the same batch; alert at most every 20s per row.
      const last = alerted.current.get(row.id) ?? 0;
      if (!isInsert && Date.now() - last < 20_000) return;
      alerted.current.set(row.id, Date.now());

      const prefs = getNotifyPrefs();
      const isDm = row.notification_type === "dm" || row.source_entity_type === "dm";
      const isReply = ["reply", "mention", "quote", "notable_mention"].includes(row.notification_type);
      const href =
        row.source_entity_type === "dm" && row.source_entity_id
          ? `${base}/messages/${row.source_entity_id}`
          : row.source_entity_type === "post" && row.source_entity_id
            ? `${base}/post/${row.source_entity_id}`
            : `${base}/notifications`;
      // Don't alert about the conversation you're already reading.
      if (isDm && row.source_entity_id && window.location.pathname.includes(row.source_entity_id)) return;
      const wanted = isDm ? prefs.dms : isReply ? prefs.replies : row.priority >= 2;
      if (!wanted) return;

      if (prefs.sound && (isDm || isReply)) playBlip(isDm ? "dm" : "reply");
      if (document.hidden && prefs.system && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const n = new Notification(row.title, { body: row.body || undefined, tag: row.id, icon: "/favicon.ico" });
          n.onclick = () => {
            window.focus();
            navRef.current(href);
            n.close();
          };
        } catch {
          /* some mobile browsers only allow notifications from a service worker */
        }
      }
      if (prefs.toasts) {
        toast(row.title, {
          description: row.body ? row.body.slice(0, 120) : undefined,
          action: { label: isDm ? "Reply" : "Open", onClick: () => navRef.current(href) },
          duration: isDm ? 7000 : 5000,
        });
      }
    };
    const channel = supabase
      .channel(`notif-${worldId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${user.id}` }, (payload) =>
        handle(payload.new as NotifRealtimeRow, true),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${user.id}` }, (payload) =>
        handle(payload.new as NotifRealtimeRow, false),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, worldId, queryClient]);

  // Realtime: DMs arriving and SIM typing state.
  const playerId = sync.data?.player.id;
  useEffect(() => {
    if (!playerId) return;
    const channel = supabase
      .channel(`dm-${playerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_threads", filter: `player_id=eq.${playerId}` }, (payload) => {
        const row = payload.new as { id?: string } | null;
        queryClient.invalidateQueries({ queryKey: ["dms", worldId] });
        if (row?.id) queryClient.invalidateQueries({ queryKey: ["dm", worldId, row.id] });
        queryClient.invalidateQueries({ queryKey: ["sync", worldId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [playerId, worldId, queryClient]);

  /** Refresh after an action that may produce delayed reactions. */
  const refreshSoon = useCallback(() => {
    const run = () => {
      queryClient.invalidateQueries({ queryKey: ["sync", worldId] });
      queryClient.invalidateQueries({ queryKey: ["feed", worldId] });
      queryClient.invalidateQueries({ queryKey: ["thread", worldId] });
      queryClient.invalidateQueries({ queryKey: ["sidebar", worldId] });
    };
    run();
    const t1 = setTimeout(run, 5000);
    const t2 = setTimeout(run, 14000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [queryClient, worldId]);

  return {
    worldId,
    data: sync.data ?? null,
    world: sync.data?.world ?? null,
    player: sync.data?.player ?? null,
    rank: sync.data?.rank ?? null,
    unread: sync.data?.unread ?? 0,
    unreadDms: sync.data?.unreadDms ?? 0,
    isOwner: sync.data?.world.isOwner ?? false,
    isLoading: sync.isLoading,
    error: sync.error,
    refetch: sync.refetch,
    summary,
    dismissSummary: () => setSummary(null),
    refreshSoon,
    base: `/w/${worldId}`,
  };
});
