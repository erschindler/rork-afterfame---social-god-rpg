import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { callFn, errorMessage } from "@/lib/api";
import { compact } from "@/lib/format";
import type { PollView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorld } from "@/providers/WorldProvider";

function timeLeft(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "Final results";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m left`;
  const h = Math.round(m / 60);
  return `${h}h left`;
}

/** Inline poll: tappable options until you vote, then animated result bars. */
export function PollCard({ postId, poll }: { postId: string; poll: PollView }) {
  const { worldId } = useWorld();
  const [state, setState] = useState<PollView>(poll);
  const [busy, setBusy] = useState<boolean>(false);
  const [, tick] = useState<number>(0);

  useEffect(() => setState(poll), [poll]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const closed = state.closed || Date.parse(state.closes_at) <= Date.now();
  const showResults = closed || state.viewer_vote !== null || state.is_own;
  const max = Math.max(...state.counts);

  const vote = async (i: number) => {
    if (busy || showResults) return;
    setBusy(true);
    const prev = state;
    setState({ ...state, viewer_vote: i, counts: state.counts.map((c, j) => c + (j === i ? 1 : 0)), total: state.total + 1 });
    try {
      const res = await callFn<{ poll: { counts: number[] }; vote: number }>("social", { action: "vote", worldId, postId, option: i });
      setState((s) => ({ ...s, counts: res.poll.counts, total: res.poll.counts.reduce((a, b) => a + b, 0), viewer_vote: res.vote }));
    } catch (err) {
      setState(prev);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2.5 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      {state.options.map((opt, i) => {
        const pct = state.total ? Math.round((state.counts[i] / state.total) * 100) : 0;
        const leading = showResults && state.counts[i] === max && max > 0;
        const mine = state.viewer_vote === i;
        if (!showResults) {
          return (
            <button
              key={opt}
              type="button"
              disabled={busy}
              onClick={() => vote(i)}
              className="min-h-10 rounded-full border border-brand/60 px-4 text-left text-[15px] font-semibold text-brand transition-colors hover:bg-brand/10 active:scale-[0.99] disabled:opacity-60"
            >
              {opt}
            </button>
          );
        }
        return (
          <div key={opt} className="relative h-10 overflow-hidden rounded-lg" aria-label={`${opt}: ${pct}%`}>
            <div
              className={cn("absolute inset-y-0 left-0 rounded-lg transition-[width] duration-700 ease-out", leading ? "bg-brand/30" : "bg-elevated")}
              style={{ width: `${Math.max(pct, 2)}%` }}
            />
            <div className="relative flex h-full items-center justify-between px-3 text-[15px]">
              <span className={cn("flex items-center gap-1.5 truncate", leading && "font-bold")}>
                {opt}
                {mine && <Check className="h-4 w-4 text-brand" aria-label="Your vote" />}
              </span>
              <span className={cn("tabular-nums", leading ? "font-bold" : "text-muted-foreground")}>{pct}%</span>
            </div>
          </div>
        );
      })}
      <p className="text-[13px] text-muted-foreground">
        {compact(state.total)} {state.total === 1 ? "vote" : "votes"} · {closed ? "Final results" : timeLeft(state.closes_at)}
      </p>
    </div>
  );
}
