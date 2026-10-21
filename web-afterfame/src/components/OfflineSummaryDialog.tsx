import { Clock, Hash, Sparkles, Users, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { timeAgo } from "@/lib/format";
import { useWorld } from "@/providers/WorldProvider";

const ICONS: Record<string, typeof Zap> = { trend_explosion: Hash, surprise_reconciliation: Users, community_milestone: Users };

/** "While you were away": every item is a recorded world event. */
export function OfflineSummaryDialog() {
  const { summary, dismissSummary, base } = useWorld();
  const navigate = useNavigate();
  return (
    <Dialog open={!!summary} onOpenChange={(o) => !o && dismissSummary()}>
      <DialogContent className="max-w-md rounded-2xl border-border bg-card">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-brand/15 text-brand">
            <Clock className="h-5 w-5" />
          </span>
          <div>
            <DialogTitle className="text-xl">While you were away</DialogTitle>
            <DialogDescription>
              {summary?.away} passed. {summary?.items.length} notable {summary?.items.length === 1 ? "thing" : "things"} happened.
            </DialogDescription>
          </div>
        </div>
        <ul className="mt-2 divide-y divide-border">
          {summary?.items.map((e) => {
            const Icon = e.involves_player ? Sparkles : (ICONS[e.event_type] ?? Zap);
            return (
              <li key={e.id} className="flex gap-3 py-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${e.involves_player ? "bg-brand/15 text-brand" : "bg-elevated text-controversy"}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium leading-snug">{e.description}</p>
                  <p className="text-xs text-muted-foreground">{timeAgo(e.started_at)} ago</p>
                </div>
              </li>
            );
          })}
        </ul>
        {summary && summary.unread > 0 && <p className="text-sm text-muted-foreground">You also have {summary.unread} unread notifications.</p>}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={dismissSummary}>
            Back to feed
          </Button>
          <Button
            className="flex-1 font-bold"
            onClick={() => {
              dismissSummary();
              navigate(`${base}/events`);
            }}
          >
            View all events
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
