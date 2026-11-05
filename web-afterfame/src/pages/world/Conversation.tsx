import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeDollarSign, Check, Loader2, SendHorizontal, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { SimBadge } from "@/components/SimBadge";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { callFn, errorMessage } from "@/lib/api";
import { compact } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { DmMessage, DmThreadResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorld } from "@/providers/WorldProvider";

import { TypingDots } from "./Messages";

const MAX = 500;

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function OfferCard({ m, simName, onAnswer }: { m: DmMessage; simName: string; onAnswer: (accept: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const status = m.meta.status ?? "pending";
  return (
    <div className="my-1 w-full max-w-[420px] rounded-2xl border border-brand/40 bg-brand/[0.06] p-4 animate-rise-in">
      <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-brand">
        <BadgeDollarSign className="h-4 w-4" /> Sponsorship offer
      </div>
      <p className="mt-2 text-[15px] leading-snug">{m.content}</p>
      {typeof m.meta.fee === "number" && (
        <p className="mt-3 text-2xl font-bold tabular-nums">
          {compact(m.meta.fee)} <span className="text-sm font-medium text-muted-foreground">credits</span>
        </p>
      )}
      {status === "pending" ? (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            className="rounded-full font-bold"
            disabled={!!busy}
            onClick={async () => {
              setBusy("yes");
              await onAnswer(true);
              setBusy(null);
            }}
          >
            {busy === "yes" ? <Loader2 className="animate-spin" /> : <Check />} Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full font-bold"
            disabled={!!busy}
            onClick={async () => {
              setBusy("no");
              await onAnswer(false);
              setBusy(null);
            }}
          >
            {busy === "no" ? <Loader2 className="animate-spin" /> : <X />} Decline
          </Button>
        </div>
      ) : (
        <p className={cn("mt-3 text-sm font-semibold", status === "accepted" ? "text-brand" : "text-muted-foreground")}>
          {status === "accepted" ? `Accepted. ${simName} will be watching your next post.` : "Declined"}
        </p>
      )}
    </div>
  );
}

export default function Conversation() {
  const { key = "" } = useParams();
  const { worldId, base } = useWorld();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const simParam = key.startsWith("@") ? key.slice(1) : null;
  const threadParam = simParam ? null : key;
  const [text, setText] = useState<string>("");
  const [pending, setPending] = useState<DmMessage[]>([]);
  const [now, setNow] = useState<number>(Date.now());
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef<boolean>(true);

  const q = useQuery({
    queryKey: ["dm", worldId, threadParam ?? `sim:${simParam}`],
    queryFn: () => callFn<DmThreadResponse>("feed", { action: "dm_thread", worldId, ...(threadParam ? { threadId: threadParam } : { accountId: simParam }) }),
    refetchInterval: 4_000,
    refetchIntervalInBackground: false,
  });
  const data = q.data;
  const threadId = data?.thread?.id ?? threadParam;

  // Opening via @sim when a thread already exists: switch to the canonical URL.
  useEffect(() => {
    if (simParam && data?.thread?.id) navigate(`${base}/messages/${data.thread.id}`, { replace: true });
  }, [simParam, data?.thread?.id, base, navigate]);

  // Opening the thread marks it read on the server; refresh badges.
  useEffect(() => {
    if (data) {
      queryClient.invalidateQueries({ queryKey: ["sync", worldId] });
      queryClient.invalidateQueries({ queryKey: ["dms", worldId] });
    }
  }, [data?.messages.length, worldId, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: new messages in this thread.
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`dmthread-${threadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["dm", worldId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, worldId, queryClient]);

  const typingUntil = data?.thread?.sim_typing_until ? Date.parse(data.thread.sim_typing_until) : 0;
  const typing = typingUntil > now;
  useEffect(() => {
    if (typingUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [typingUntil]);

  const messages = useMemo(() => {
    const server = data?.messages ?? [];
    const ids = new Set(server.map((m) => m.content + m.sender_type));
    return [...server, ...pending.filter((p) => !ids.has(p.content + p.sender_type))];
  }, [data?.messages, pending]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing]);

  const lastPlayer = [...messages].reverse().find((m) => m.sender_type === "player");
  const lastIsPlayer = messages[messages.length - 1]?.sender_type === "player";
  const seen = !!(lastPlayer && data?.thread?.sim_last_read_at && Date.parse(data.thread.sim_last_read_at) >= Date.parse(lastPlayer.created_at));

  const send = async () => {
    const content = text.trim();
    if (!content || content.length > MAX || !data) return;
    const temp: DmMessage = { id: `tmp-${Date.now()}`, thread_id: threadId ?? "", sender_type: "player", content, kind: "text", meta: {}, created_at: new Date().toISOString() };
    setPending((p) => [...p, temp]);
    setText("");
    stick.current = true;
    try {
      const res = await callFn<{ threadId: string }>("social", { action: "dm_send", worldId, accountId: data.sim.id, content });
      if (!threadId) navigate(`${base}/messages/${res.threadId}`, { replace: true });
      await queryClient.invalidateQueries({ queryKey: ["dm", worldId] });
      setPending((p) => p.filter((x) => x.id !== temp.id));
    } catch (err) {
      setPending((p) => p.filter((x) => x.id !== temp.id));
      setText(content);
      toast.error(errorMessage(err));
    }
    input.current?.focus();
  };

  const answerOffer = async (messageId: string, accept: boolean) => {
    try {
      const res = await callFn<{ summary: string }>("social", { action: "dm_offer", worldId, messageId, accept });
      toast(res.summary);
      queryClient.invalidateQueries({ queryKey: ["dm", worldId] });
      queryClient.invalidateQueries({ queryKey: ["sync", worldId] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const sim = data?.sim;
  const rel = data?.relationship;

  return (
    <div className="flex h-[calc(100dvh-56px-64px-env(safe-area-inset-bottom))] flex-col lg:h-dvh">
      <PageHeader
        title={sim?.display_name ?? "Conversation"}
        subtitle={typing ? "typing…" : sim ? `@${sim.username}${rel ? ` · ${rel.relationship_status.replace(/_/g, " ")}` : ""}` : undefined}
        back={`${base}/messages`}
        right={sim ? <Link to={`${base}/u/${sim.username}`} aria-label={`${sim.display_name}'s profile`}><Avatar seed={sim.avatar_reference} size={36} /></Link> : null}
        className="shrink-0"
      />
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {q.isLoading && (
          <div className="grid h-full place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
          </div>
        )}
        {sim && (
          <div className="mb-6 flex flex-col items-center border-b border-border pb-6 text-center">
            <Avatar seed={sim.avatar_reference} size={64} />
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-lg font-bold">{sim.display_name}</span>
              <SimBadge />
            </div>
            <span className="text-sm text-muted-foreground">@{sim.username}{typeof sim.follower_count_cache === "number" ? ` · ${compact(sim.follower_count_cache)} followers` : ""}</span>
            {sim.bio && <p className="mt-2 max-w-sm text-sm text-foreground/80">{sim.bio}</p>}
            <p className="mt-3 max-w-xs text-[12px] text-muted-foreground">This is a fictional simulated person. Replies are generated by the world, not a real human.</p>
          </div>
        )}
        <ol className="flex flex-col gap-1">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const showDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
            const gap = prev && Date.parse(m.created_at) - Date.parse(prev.created_at) > 20 * 60_000;
            const mine = m.sender_type === "player";
            const groupedWithNext = messages[i + 1]?.sender_type === m.sender_type && Date.parse(messages[i + 1].created_at) - Date.parse(m.created_at) < 120_000;
            return (
              <li key={m.id} className="flex flex-col">
                {(showDay || gap) && (
                  <span className="my-3 self-center text-[12px] font-medium text-muted-foreground">
                    {showDay ? `${dayLabel(m.created_at)} · ${clock(m.created_at)}` : clock(m.created_at)}
                  </span>
                )}
                {m.kind === "offer" ? (
                  <OfferCard m={m} simName={sim?.display_name ?? "They"} onAnswer={(a) => answerOffer(m.id, a)} />
                ) : m.kind === "system" ? (
                  <span className="my-2 self-center rounded-full bg-elevated px-3 py-1 text-[12px] text-muted-foreground">{m.content}</span>
                ) : (
                  <div
                    className={cn(
                      "max-w-[78%] whitespace-pre-wrap break-words px-4 py-2.5 text-[15px] leading-snug animate-rise-in",
                      mine ? "self-end rounded-[20px] bg-primary text-primary-foreground" : "self-start rounded-[20px] bg-elevated text-foreground",
                      mine && groupedWithNext && "rounded-br-md",
                      !mine && groupedWithNext && "rounded-bl-md",
                      m.id.startsWith("tmp-") && "opacity-70",
                    )}
                  >
                    {m.content}
                  </div>
                )}
                {!groupedWithNext && m.kind === "text" && (
                  <span className={cn("mb-1.5 mt-1 text-[11px] text-muted-foreground", mine ? "self-end" : "self-start")}>
                    {m.id.startsWith("tmp-") ? "Sending…" : mine && m.id === lastPlayer?.id && lastIsPlayer ? (seen ? "Seen" : `Sent · ${clock(m.created_at)}`) : clock(m.created_at)}
                  </span>
                )}
              </li>
            );
          })}
          {typing && (
            <li className="self-start rounded-[20px] bg-elevated px-4 py-3.5 text-muted-foreground animate-rise-in" aria-live="polite">
              <TypingDots />
            </li>
          )}
        </ol>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="shrink-0 border-t border-border bg-background/95 px-3 py-3 backdrop-blur-md"
      >
        <div className="flex items-end gap-2 rounded-3xl bg-elevated px-4 py-1.5 focus-within:ring-1 focus-within:ring-brand/60">
          <textarea
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={MAX}
            placeholder={sim ? `Message @${sim.username}` : "Start a message"}
            aria-label="Message"
            disabled={!data}
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-snug placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!text.trim() || !data}
            className="mb-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-90 disabled:bg-transparent disabled:text-muted-foreground"
          >
            <SendHorizontal className="h-[18px] w-[18px]" />
          </button>
        </div>
        {text.length > MAX - 60 && <p className="mt-1 px-4 text-right text-[11px] tabular-nums text-muted-foreground">{text.length}/{MAX}</p>}
      </form>
    </div>
  );
}
