import { useQuery } from "@tanstack/react-query";
import { HeartHandshake } from "lucide-react";
import { Link } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { SimBadge } from "@/components/SimBadge";
import { EmptyState, ErrorState, FeedSkeleton } from "@/components/States";
import { callFn } from "@/lib/api";
import { one, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWorld } from "@/providers/WorldProvider";

interface Rel {
  id: string;
  relationship_score: number;
  relationship_status: string;
  interaction_count: number;
  last_interaction_at: string | null;
  account: { id: string; username: string; display_name: string; avatar_reference: string; archetype: string } | null;
  history: { delta: number; reason: string; created_at: string }[];
}

const GROUPS: { title: string; statuses: string[]; tone: string }[] = [
  { title: "Allies", statuses: ["collaborator", "friend", "mentor", "supporter"], tone: "text-admiration" },
  { title: "Tension", statuses: ["rival", "public_enemy", "critic", "former_ally"], tone: "text-infamy" },
];

export default function Relationships() {
  const { worldId, base } = useWorld();
  const q = useQuery({ queryKey: ["relationships", worldId], queryFn: () => callFn<{ relationships: Rel[] }>("feed", { action: "relationships", worldId }) });
  const rels = q.data?.relationships ?? [];
  return (
    <div>
      <PageHeader title="Relationships" subtitle="Inferred from what actually happened between you." back={`${base}/fame`} />
      {q.isLoading && <FeedSkeleton count={3} />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && rels.length === 0 && <EmptyState icon={<HeartHandshake className="h-5 w-5" />} title="No meaningful relationships yet" body="Reply thoughtfully, support people, or pick a fight. Relationships form from real interactions." />}
      {GROUPS.map((g) => {
        const list = rels.filter((r) => g.statuses.includes(r.relationship_status) && r.account);
        if (!list.length) return null;
        return (
          <section key={g.title} className="border-b border-border pb-2">
            <h2 className={cn("px-4 pb-1 pt-5 text-lg font-bold", g.tone)}>{g.title}</h2>
            <ul>
              {list.map((r) => (
                <li key={r.id}>
                  <Link to={`${base}/u/${r.account!.username}`} className="flex gap-3 px-4 py-3 hover:bg-elevated/60">
                    <Avatar seed={r.account!.avatar_reference} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-bold">{r.account!.display_name}</span>
                        <SimBadge />
                        <span className={cn("ml-auto shrink-0 text-sm font-semibold capitalize", g.tone)}>{r.relationship_status.replace("_", " ")}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        @{r.account!.username} · score {one(r.relationship_score)} · {r.interaction_count} interactions{r.last_interaction_at && ` · ${timeAgo(r.last_interaction_at)}`}
                      </p>
                      {r.history[0] && (
                        <p className="mt-1 text-sm">
                          Latest: {r.history[0].reason}{" "}
                          <span className={r.history[0].delta >= 0 ? "text-brand" : "text-infamy"}>({r.history[0].delta > 0 ? "+" : ""}{one(r.history[0].delta)})</span>
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
