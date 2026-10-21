import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";
import { EmptyState, ErrorState, FeedSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { callFn, errorMessage } from "@/lib/api";
import { topicName } from "@/lib/topics";
import type { CommunityRow, PostView } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { useWorld } from "@/providers/WorldProvider";

function JoinButton({ communityId, joined }: { communityId: string; joined: boolean }) {
  const { worldId } = useWorld();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<boolean>(false);
  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      await callFn("social", { action: joined ? "leave_community" : "join_community", worldId, communityId });
      toast(joined ? "Left community" : "Joined. Posts in this topic now build your standing here.");
      queryClient.invalidateQueries({ queryKey: ["communities", worldId] });
      queryClient.invalidateQueries({ queryKey: ["community", worldId] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant={joined ? "outline" : "default"} onClick={toggle} disabled={busy} className="rounded-full font-bold">
      {busy ? <Loader2 className="animate-spin" /> : joined ? <Check /> : <Plus />} {joined ? "Joined" : "Join"}
    </Button>
  );
}

export function CommunitiesPage() {
  const { worldId, base, player } = useWorld();
  const q = useQuery({
    queryKey: ["communities", worldId],
    queryFn: async () => {
      const [c, m] = await Promise.all([
        supabase.from("communities").select("id, name, slug, description, member_count, activity_score, topic_id, community_norms").eq("world_id", worldId).order("activity_score", { ascending: false }),
        supabase.from("community_memberships").select("community_id, standing").eq("player_id", player!.id),
      ]);
      if (c.error || m.error) throw new Error("Couldn't load communities.");
      return { communities: (c.data ?? []) as unknown as CommunityRow[], mine: new Map((m.data ?? []).map((r) => [r.community_id, r.standing])) };
    },
    enabled: !!player,
  });
  return (
    <div>
      <PageHeader title="Communities" subtitle="Each has its own norms. What works in one can flop in another." />
      {q.isLoading && <FeedSkeleton count={4} />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {q.data?.communities.map((c) => {
          const standing = q.data.mine.get(c.id);
          return (
            <Link key={c.id} to={`${base}/c/${c.slug}`} className="panel flex flex-col p-4 transition-colors hover:bg-elevated animate-rise-in">
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-influence/15 text-influence">
                  <Users className="h-5 w-5" />
                </span>
                <JoinButton communityId={c.id} joined={standing !== undefined} />
              </div>
              <p className="mt-3 text-lg font-bold">{c.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
              {c.community_norms?.summary && <p className="mt-3 rounded-lg bg-background/60 px-3 py-2 text-[13px] text-foreground/80 ring-1 ring-border">Norms: {c.community_norms.summary}</p>}
              <p className="mt-3 text-xs text-muted-foreground">
                {c.member_count} members · {topicName(c.topic_id)}
                {standing !== undefined && ` · Your standing: ${Math.round(standing)}`}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

interface CommunityDetail {
  community: CommunityRow & { community_norms: { prefers: string[]; dislikes: string[]; summary: string } };
  membership: { standing: number; role: string } | null;
  moderators: { simulated_accounts: { id: string; username: string; display_name: string; avatar_reference: string } }[];
  events: { id: string; title: string; description: string; started_at: string }[];
  posts: PostView[];
}

export function CommunityPage() {
  const { slug = "" } = useParams();
  const { worldId, base } = useWorld();
  const q = useQuery({ queryKey: ["community", worldId, slug], queryFn: () => callFn<CommunityDetail>("feed", { action: "community", worldId, slug }) });
  const d = q.data;
  return (
    <div>
      <PageHeader title={d?.community.name ?? "Community"} subtitle={d ? `${d.community.member_count} members · ${topicName(d.community.topic_id)}` : undefined} back={`${base}/communities`} right={d && <JoinButton communityId={d.community.id} joined={!!d.membership} />} />
      {q.isLoading && <FeedSkeleton count={4} />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {d && (
        <>
          <div className="space-y-3 border-b border-border p-4">
            <p className="text-[15px]">{d.community.description}</p>
            <div className="flex flex-wrap gap-2 text-[13px]">
              {d.community.community_norms.prefers.map((p) => (
                <span key={p} className="rounded-full bg-brand/10 px-2.5 py-1 text-brand">Rewards {p}</span>
              ))}
              {d.community.community_norms.dislikes.map((p) => (
                <span key={p} className="rounded-full bg-infamy/10 px-2.5 py-1 text-infamy">Punishes {p}</span>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{d.community.community_norms.summary}</p>
            {d.membership && <p className="text-sm">Your standing: <b className="tabular-nums">{Math.round(d.membership.standing)}</b> <span className="text-muted-foreground">— grows when you post good {topicName(d.community.topic_id).toLowerCase()} content.</span></p>}
            {d.moderators.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4" /> Moderated by
                {d.moderators.map((m) => (
                  <Link key={m.simulated_accounts.id} to={`${base}/u/${m.simulated_accounts.username}`} className="flex items-center gap-1 text-foreground hover:underline">
                    <Avatar seed={m.simulated_accounts.avatar_reference} size={20} /> @{m.simulated_accounts.username}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {d.posts.length === 0 ? <EmptyState title="Quiet in here" body="Be the first to post in this topic." /> : d.posts.map((p) => <PostCard key={p.id} post={p} />)}
        </>
      )}
    </div>
  );
}
