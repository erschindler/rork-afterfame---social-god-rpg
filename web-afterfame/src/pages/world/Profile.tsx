import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Ban, Brain, CalendarDays, Flame, HeartHandshake, MoreHorizontal, Pin, Target, VolumeX } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Avatar } from "@/components/Avatar";
import { EditProfileDialog } from "@/components/EditProfileDialog";
import { FollowButton } from "@/components/FollowButton";
import { Meter } from "@/components/Meter";
import { PageHeader } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";
import { SimBadge } from "@/components/SimBadge";
import { EmptyState, ErrorState, FeedSkeleton } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { callFn, errorMessage } from "@/lib/api";
import { ATTRS } from "@/lib/attributes";
import { compact, one, shortDate, timeAgo } from "@/lib/format";
import { topicName } from "@/lib/topics";
import type { PostView, RankInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorld } from "@/providers/WorldProvider";

interface SimProfile {
  kind: "sim";
  account: { id: string; username: string; display_name: string; bio: string; avatar: string; label: string; interests: string[]; followers: number; following: number; fame: number; credibility: number; admiration: number; infamy: number; influence: number; controversy: number; joined: string; goals: string[]; communication_style: string };
  relationship: { relationship_score: number; relationship_status: string; interaction_count: number; last_interaction_at: string | null } | null;
  relationshipHistory: { delta: number; reason: string; created_at: string }[];
  memories: { memory_type: string; summary: string; sentiment: number; occurred_at: string }[];
  communities: { role: string; communities: { id: string; name: string; slug: string } }[];
  events: { id: string; title: string; description: string; started_at: string }[];
  viewer: { following: boolean; followsYou: boolean; muted: boolean; blocked: boolean };
  posts: PostView[];
}

interface PlayerProfile {
  kind: "player";
  account: { id: string; username: string; display_name: string; bio: string; avatar: string; interests: string[]; followers: number; following: number; posts: number; joined: string; rank: string; notoriety: string; career: string[]; niche_topic: string | null; streak_days: number; stats: Record<string, number> | null; rankProgress: RankInfo | null };
  isSelf: boolean;
  pinned: PostView | null;
  achievements: { unlocked_at: string; achievements: { code: string; name: string; description: string } }[];
  milestones: { id: string; title: string; description: string; started_at: string }[];
  posts: PostView[];
}

type ProfileData = SimProfile | PlayerProfile;

const STATUS_TONE: Record<string, string> = {
  friend: "text-admiration", supporter: "text-admiration", collaborator: "text-brand", mentor: "text-brand",
  rival: "text-infamy", public_enemy: "text-infamy", critic: "text-controversy", former_ally: "text-controversy", acquaintance: "text-muted-foreground",
};

function Tabs({ tab, setTab }: { tab: string; setTab: (t: string) => void }) {
  return (
    <div role="tablist" className="flex border-b border-border">
      {["posts", "replies", "quotes"].map((t) => (
        <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("relative flex-1 py-3.5 text-[15px] font-medium capitalize hover:bg-elevated/60", tab === t ? "text-foreground" : "text-muted-foreground")}>
          {t}
          {tab === t && <span className="absolute bottom-0 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-brand" />}
        </button>
      ))}
    </div>
  );
}

function useModerate(accountId: string | undefined) {
  const { worldId } = useWorld();
  const queryClient = useQueryClient();
  const moderate = async (action: string) => {
    if (!accountId) return;
    try {
      await callFn("social", { action, worldId, accountId });
      toast(`Done: ${action}`);
      queryClient.invalidateQueries({ queryKey: ["profile", worldId] });
      queryClient.invalidateQueries({ queryKey: ["feed", worldId] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return { moderate };
}

export default function Profile() {
  const { username = "" } = useParams();
  const { worldId, base } = useWorld();
  const [tab, setTab] = useState<string>("posts");
  const [editing, setEditing] = useState<boolean>(false);
  const q = useQuery({ queryKey: ["profile", worldId, username, tab], queryFn: () => callFn<ProfileData>("feed", { action: "profile", worldId, username, tab }) });
  const d = q.data;
  const sim = d?.kind === "sim" ? d : null;
  const pl = d?.kind === "player" ? d : null;
  const { moderate } = useModerate(sim?.account.id);

  return (
    <div>
      <PageHeader title={d?.account.display_name ?? `@${username}`} subtitle={d ? `${compact(d.kind === "player" ? d.account.posts : d.posts.length)} posts` : undefined} back />
      {q.isLoading && <FeedSkeleton count={3} />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {d && (
        <>
          <div className="relative h-32 overflow-hidden border-b border-border bg-gradient-to-br from-elevated via-surface to-background sm:h-40">
            <div className="grain absolute inset-0" aria-hidden />
            <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand/10 blur-3xl" aria-hidden />
          </div>
          <div className="px-4 pb-4">
            <div className="-mt-12 flex items-end justify-between">
              <Avatar seed={d.account.avatar} size={104} className="ring-4 ring-background" />
              <div className="flex items-center gap-2 pb-1">
                {sim && (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="rounded-full" aria-label="More">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => moderate(sim.viewer.muted ? "unmute" : "mute")}>
                          <VolumeX /> {sim.viewer.muted ? "Unmute" : "Mute"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => moderate(sim.viewer.blocked ? "unblock" : "block")}>
                          <Ban /> {sim.viewer.blocked ? "Unblock" : "Block"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {!sim.viewer.blocked && <FollowButton key={String(sim.viewer.following)} accountId={sim.account.id} username={sim.account.username} initial={sim.viewer.following} size="default" />}
                  </>
                )}
                {pl?.isSelf && (
                  <Button variant="outline" className="rounded-full font-bold" onClick={() => setEditing(true)}>
                    Edit profile
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold">{d.account.display_name}</h2>
                {sim && <SimBadge />}
              </div>
              <p className="text-muted-foreground">
                @{d.account.username}
                {sim?.viewer.followsYou && <span className="ml-2 rounded bg-elevated px-1.5 py-0.5 text-xs">Follows you</span>}
              </p>
              {d.account.bio && <p className="mt-3 text-[15px]">{d.account.bio}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {sim && <span>{sim.account.label}</span>}
                {pl && (
                  <span className="rounded-md bg-elevated px-2 py-0.5 font-medium text-foreground ring-1 ring-border">{pl.account.rank}</span>
                )}
                {pl && pl.account.notoriety !== "Unknown" && (
                  <span className="flex items-center gap-1 text-infamy"><Flame className="h-3.5 w-3.5" /> {pl.account.notoriety}</span>
                )}
                {pl?.account.career.length ? <span>{pl.account.career.join(" · ")}</span> : null}
                <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" /> Joined {shortDate(d.account.joined)}</span>
              </div>
              <div className="mt-3 flex gap-5 text-[15px]">
                <span><b className="tabular-nums">{compact(d.account.following)}</b> <span className="text-muted-foreground">Following</span></span>
                <span><b className="tabular-nums">{compact(d.account.followers)}</b> <span className="text-muted-foreground">Followers</span></span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.account.interests.map((i) => (
                  <span key={i} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">{topicName(i)}</span>
                ))}
              </div>
            </div>
          </div>

          {sim && (
            <div className="space-y-3 border-t border-border p-4">
              <div className="panel p-4">
                <h3 className="flex items-center gap-2 font-bold"><HeartHandshake className="h-4 w-4 text-brand" /> Your relationship</h3>
                {sim.relationship ? (
                  <>
                    <p className="mt-1.5 text-sm">
                      <span className={cn("font-semibold capitalize", STATUS_TONE[sim.relationship.relationship_status])}>{sim.relationship.relationship_status.replace("_", " ")}</span>
                      <span className="text-muted-foreground"> · score {one(sim.relationship.relationship_score)} · {sim.relationship.interaction_count} interactions</span>
                    </p>
                    {sim.relationshipHistory.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {sim.relationshipHistory.slice(0, 5).map((h, i) => (
                          <li key={i} className="flex justify-between gap-3 text-sm">
                            <span>{h.reason}</span>
                            <span className={cn("shrink-0 font-semibold tabular-nums", h.delta >= 0 ? "text-brand" : "text-infamy")}>{h.delta > 0 ? "+" : ""}{one(h.delta)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">You haven't interacted yet. They don't know you exist.</p>
                )}
              </div>
              {sim.memories.length > 0 && (
                <div className="panel p-4">
                  <h3 className="flex items-center gap-2 font-bold"><Brain className="h-4 w-4 text-influence" /> What they remember about you</h3>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {sim.memories.map((m, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className={m.sentiment < -0.2 ? "text-infamy" : m.sentiment > 0.2 ? "text-admiration" : ""}>“{m.summary}”</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(m.occurred_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="panel p-4">
                  <h3 className="flex items-center gap-2 font-bold"><Target className="h-4 w-4 text-controversy" /> Currently pursuing</h3>
                  <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
                    {sim.account.goals.map((g) => <li key={g}>{g}</li>)}
                  </ul>
                </div>
                <div className="panel space-y-2 p-4">
                  <h3 className="font-bold">Public standing</h3>
                  {ATTRS.filter((a) => ["fame", "credibility", "infamy"].includes(a.key)).map((a) => (
                    <div key={a.key}>
                      <div className="flex justify-between text-xs"><span>{a.label}</span><span className="tabular-nums">{Math.round(Number(sim.account[a.key as "fame"]))}</span></div>
                      <Meter value={Number(sim.account[a.key as "fame"])} tone={a.tone} className="mt-1 h-1.5" label={a.label} />
                    </div>
                  ))}
                </div>
              </div>
              {sim.communities.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Member of{" "}
                  {sim.communities.map((c, i) => (
                    <span key={c.communities.id}>
                      {i > 0 && ", "}
                      <Link to={`${base}/c/${c.communities.slug}`} className="text-foreground hover:underline">{c.communities.name}</Link>
                      {c.role === "moderator" && " (mod)"}
                    </span>
                  ))}
                </p>
              )}
            </div>
          )}

          {pl && (
            <div className="space-y-3 border-t border-border p-4">
              {pl.account.stats && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {ATTRS.map((a) => (
                    <div key={a.key} className="rounded-xl border border-border p-3">
                      <p className={cn("flex items-center gap-1.5 text-xs", a.text)}><a.icon className="h-3.5 w-3.5" /> {a.label}</p>
                      <p className="mt-1 text-xl font-bold tabular-nums">{Math.round(pl.account.stats![a.key] ?? 0)}</p>
                    </div>
                  ))}
                </div>
              )}
              {!pl.account.stats && <p className="text-sm text-muted-foreground">This player keeps their reputation stats private.</p>}
              {pl.achievements.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pl.achievements.slice(0, 6).map((a) => (
                    <span key={a.achievements.code} title={a.achievements.description} className="flex items-center gap-1.5 rounded-full bg-fame/10 px-3 py-1 text-xs font-medium text-fame">
                      <Award className="h-3.5 w-3.5" /> {a.achievements.name}
                    </span>
                  ))}
                </div>
              )}
              {pl.isSelf && pl.account.streak_days > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Flame className="h-4 w-4 text-controversy" /> {pl.account.streak_days}-day challenge streak
                </p>
              )}
            </div>
          )}

          {pl?.pinned && (
            <div className="border-t border-border">
              <p className="flex items-center gap-1.5 px-4 pt-3 text-xs font-semibold text-muted-foreground"><Pin className="h-3.5 w-3.5" /> Pinned</p>
              <PostCard post={pl.pinned} />
            </div>
          )}
          <Tabs tab={tab} setTab={setTab} />
          {d.posts.length === 0 ? <EmptyState title={`No ${tab} yet`} /> : d.posts.map((p) => <PostCard key={p.id} post={p} />)}
          {pl?.isSelf && editing && <EditProfileDialog open={editing} onOpenChange={setEditing} />}
        </>
      )}
    </div>
  );
}
