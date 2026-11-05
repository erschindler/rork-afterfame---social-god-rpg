import { useQuery } from "@tanstack/react-query";
import { Mail, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { SimBadge } from "@/components/SimBadge";
import { EmptyState, ErrorState } from "@/components/States";
import { callFn } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { DmListResponse, DmThread } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorld } from "@/providers/WorldProvider";

function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)} aria-label="typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-current animate-typing" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

export { TypingDots };

function ThreadRow({ t }: { t: DmThread }) {
  const { base } = useWorld();
  const unread = t.unread_count > 0;
  return (
    <Link to={`${base}/messages/${t.id}`} className="flex gap-3 border-b border-border px-4 py-3.5 transition-colors hover:bg-surface/80 animate-rise-in">
      <div className="relative h-fit">
        <Avatar seed={t.sim?.avatar_reference ?? t.sim_id} size={48} />
        {unread && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-brand ring-2 ring-background" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[15px]">
          <span className={cn("truncate", unread ? "font-bold" : "font-semibold")}>{t.sim?.display_name ?? "Unknown"}</span>
          <SimBadge />
          <span className="truncate text-muted-foreground">@{t.sim?.username}</span>
          <span className="text-muted-foreground">·</span>
          <time className="shrink-0 text-muted-foreground" dateTime={t.last_message_at}>{timeAgo(t.last_message_at)}</time>
        </div>
        {t.typing ? (
          <p className="mt-1 flex items-center gap-2 text-sm font-medium text-brand">
            <TypingDots /> typing
          </p>
        ) : (
          <p className={cn("mt-0.5 line-clamp-1 text-[14.5px]", unread ? "font-medium text-foreground" : "text-muted-foreground")}>
            {t.last_sender === "player" && <span className="text-muted-foreground">You: </span>}
            {t.last_preview}
          </p>
        )}
        {t.status === "request" && <span className="mt-1 inline-block rounded bg-elevated px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Request</span>}
      </div>
    </Link>
  );
}

export default function Messages() {
  const { worldId, base } = useWorld();
  const [filter, setFilter] = useState<string>("");
  const [tab, setTab] = useState<"all" | "requests">("all");
  const q = useQuery({
    queryKey: ["dms", worldId],
    queryFn: () => callFn<DmListResponse>("feed", { action: "dm_list", worldId }),
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
  });

  const threads = useMemo(() => {
    const all = q.data?.threads ?? [];
    const f = filter.trim().toLowerCase();
    return all
      .filter((t) => (tab === "requests" ? t.status === "request" : t.status !== "request"))
      .filter((t) => !f || t.sim?.username.toLowerCase().includes(f) || t.sim?.display_name.toLowerCase().includes(f));
  }, [q.data, filter, tab]);
  const requestCount = (q.data?.threads ?? []).filter((t) => t.status === "request").length;

  return (
    <div>
      <PageHeader title="Messages" subtitle="Private conversations with people in your world">
        <div className="px-4 pb-3">
          <label className="flex h-10 items-center gap-2 rounded-full bg-elevated px-4 text-sm text-muted-foreground focus-within:ring-1 focus-within:ring-brand/60">
            <Search className="h-4 w-4" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search conversations" className="min-w-0 flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none" aria-label="Search conversations" />
          </label>
        </div>
        <div role="tablist" className="flex">
          {(["all", "requests"] as const).map((t) => (
            <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("relative flex-1 py-3 text-[15px] font-medium capitalize hover:bg-elevated/60", tab === t ? "text-foreground" : "text-muted-foreground")}>
              {t === "all" ? "Primary" : `Requests${requestCount ? ` (${requestCount})` : ""}`}
              {tab === t && <span className="absolute bottom-0 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-brand" />}
            </button>
          ))}
        </div>
      </PageHeader>
      {q.isLoading && (
        <div className="space-y-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 border-b border-border px-4 py-4">
              <div className="h-12 w-12 animate-pulse rounded-full bg-elevated" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3.5 w-1/3 animate-pulse rounded bg-elevated" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-elevated" />
              </div>
            </div>
          ))}
        </div>
      )}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && threads.length === 0 && (
        <EmptyState
          icon={<Mail className="h-5 w-5" />}
          title={tab === "requests" ? "No message requests" : "No conversations yet"}
          body={tab === "requests" ? "Accounts that don't know you well land here first." : "Open any SIM profile and tap the envelope to start a conversation. Get noticed and people will reach out on their own."}
          action={tab === "all" ? <Link to={`${base}/discover`} className="text-sm font-semibold text-brand hover:underline">Find people to talk to</Link> : undefined}
        />
      )}
      {threads.map((t) => (
        <ThreadRow key={t.id} t={t} />
      ))}
    </div>
  );
}
