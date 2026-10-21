import { useQuery } from "@tanstack/react-query";
import { Award, Lock } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { ErrorState, FeedSkeleton } from "@/components/States";
import { shortDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useWorld } from "@/providers/WorldProvider";

export default function Achievements() {
  const { player } = useWorld();
  const q = useQuery({
    queryKey: ["achievements", player?.id],
    enabled: !!player,
    queryFn: async () => {
      const [all, mine] = await Promise.all([
        supabase.from("achievements").select("id, code, name, description, category, sort_order").order("sort_order"),
        supabase.from("player_achievements").select("achievement_id, unlocked_at").eq("player_id", player!.id),
      ]);
      if (all.error || mine.error) throw new Error("Couldn't load achievements.");
      const unlocked = new Map((mine.data ?? []).map((m) => [m.achievement_id, m.unlocked_at]));
      return (all.data ?? []).map((a) => ({ ...a, unlocked_at: unlocked.get(a.id) ?? null }));
    },
  });
  const done = q.data?.filter((a) => a.unlocked_at).length ?? 0;
  return (
    <div>
      <PageHeader title="Achievements" subtitle={q.data ? `${done} of ${q.data.length} unlocked · verified by the server` : undefined} />
      {q.isLoading && <FeedSkeleton count={3} />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      <ul className="grid gap-3 p-4 sm:grid-cols-2">
        {q.data?.map((a) => (
          <li key={a.id} className={cn("panel flex gap-3 p-4 animate-rise-in", !a.unlocked_at && "opacity-60")}>
            <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-xl", a.unlocked_at ? "bg-fame/15 text-fame" : "bg-elevated text-muted-foreground")}>
              {a.unlocked_at ? <Award className="h-6 w-6" /> : <Lock className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <p className="font-bold">{a.name}</p>
              <p className="text-sm text-muted-foreground">{a.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">{a.unlocked_at ? `Unlocked ${shortDate(a.unlocked_at)}` : a.category}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
