import createContextHook from "@nkzw/create-context-hook";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";

import { callFn } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { OfflineSummary, SyncResponse } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";

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

  // Realtime: new notifications for this user in this world.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notif-${worldId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { world_id: string; title: string; priority: number; notification_type: string };
          if (row.world_id !== worldId) return;
          if (row.priority >= 2) toast(row.title);
          queryClient.invalidateQueries({ queryKey: ["sync", worldId] });
          queryClient.invalidateQueries({ queryKey: ["notifications", worldId] });
          queryClient.invalidateQueries({ queryKey: ["sidebar", worldId] });
        },
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
