import { useQueryClient } from "@tanstack/react-query";
import { BarChart2, Hash, Loader2, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/Avatar";
import { QuotedPost } from "@/components/PostCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { callFn, errorMessage } from "@/lib/api";
import { TOPICS } from "@/lib/topics";
import { cn } from "@/lib/utils";
import { type ComposerMode, useComposer } from "@/providers/ComposerProvider";
import { useWorld } from "@/providers/WorldProvider";

const LIMIT = 280;
const DRAFT_KEY = (worldId: string) => `afterfame:draft:${worldId}`;

function CharRing({ length }: { length: number }) {
  const pct = Math.min(1, length / LIMIT);
  const r = 9;
  const c = 2 * Math.PI * r;
  const over = length > LIMIT;
  const warn = LIMIT - length <= 20;
  return (
    <div className="flex items-center gap-2 text-sm tabular-nums" aria-live="polite">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden className="-rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="2.5" />
        <circle cx="12" cy="12" r={r} fill="none" stroke={over ? "hsl(var(--infamy))" : warn ? "hsl(var(--controversy))" : "hsl(var(--brand))"} strokeWidth="2.5" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" className="transition-[stroke-dashoffset] duration-200" />
      </svg>
      <span className={cn("text-muted-foreground", over && "text-infamy", warn && !over && "text-controversy")}>
        {length}/{LIMIT}
      </span>
    </div>
  );
}

interface ComposerBoxProps {
  mode: Exclude<ComposerMode, null>;
  onDone?: () => void;
  autoFocus?: boolean;
  inline?: boolean;
}

export function ComposerBox({ mode, onDone, autoFocus, inline }: ComposerBoxProps) {
  const { player, worldId, refreshSoon } = useWorld();
  const queryClient = useQueryClient();
  const isPost = mode.kind === "post";
  const [text, setText] = useState<string>(() => {
    if (mode.kind === "post" && mode.prefill) return mode.prefill;
    if (mode.kind === "post" && inline) return localStorage.getItem(DRAFT_KEY(worldId)) ?? "";
    return "";
  });
  const [topic, setTopic] = useState<string>("auto");
  const [busy, setBusy] = useState<boolean>(false);
  const [parts, setParts] = useState<string[]>([]);
  const [poll, setPoll] = useState<{ options: string[]; durationHours: number } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (inline && isPost) localStorage.setItem(DRAFT_KEY(worldId), text);
  }, [text, inline, isPost, worldId]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text]);

  const length = text.trim().length;
  const pollOptions = poll?.options.map((o) => o.trim()).filter(Boolean) ?? [];
  const pollValid = !poll || (pollOptions.length >= 2 && new Set(pollOptions.map((o) => o.toLowerCase())).size === pollOptions.length);
  const partsValid = parts.every((p) => p.trim().length > 0 && p.length <= LIMIT);
  const canPost = length > 0 && text.length <= LIMIT && !busy && pollValid && partsValid;

  const submit = async () => {
    if (!canPost) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { worldId, content: text.trim(), topic: topic === "auto" ? null : topic };
      if (mode.kind === "reply") Object.assign(body, { action: "reply", parentId: mode.target.id });
      else if (mode.kind === "quote") Object.assign(body, { action: "quote", quotedId: mode.target.id });
      else if (parts.length) Object.assign(body, { action: "thread", contents: [text.trim(), ...parts.map((p) => p.trim())] });
      else {
        body.action = "post";
        if (poll) body.poll = { options: pollOptions, durationHours: poll.durationHours };
      }
      await callFn("social", body);
      setText("");
      setParts([]);
      setPoll(null);
      if (inline) localStorage.removeItem(DRAFT_KEY(worldId));
      toast(mode.kind === "reply" ? "Reply sent" : mode.kind === "quote" ? "Quote posted" : parts.length ? `Thread of ${parts.length + 1} posted` : poll ? "Poll is live" : "Posted. Let's see who notices.");
      queryClient.invalidateQueries({ queryKey: ["feed", worldId] });
      refreshSoon();
      onDone?.();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const placeholder = mode.kind === "reply" ? "Post your reply" : mode.kind === "quote" ? "Add your take" : "What’s happening in your world?";

  return (
    <div className="flex gap-3">
      {player && <Avatar seed={player.avatar_reference} size={inline ? 52 : 44} className="mt-0.5 hidden sm:block" />}
      <div className="min-w-0 flex-1">
        <label htmlFor={`composer-${mode.kind}`} className="sr-only">
          {placeholder}
        </label>
        <textarea
          id={`composer-${mode.kind}`}
          ref={ref}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
          placeholder={placeholder}
          rows={inline ? 2 : 3}
          className="block w-full resize-none rounded-xl border border-border bg-background/60 px-4 py-3 text-[16px] leading-snug placeholder:text-muted-foreground focus:border-brand/60 focus:outline-none focus:ring-0"
        />
        {mode.kind === "quote" && <QuotedPost post={mode.target} />}
        {isPost && poll && (
          <div className="mt-3 rounded-xl border border-border p-3">
            <div className="flex flex-col gap-2">
              {poll.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={opt}
                    maxLength={40}
                    aria-label={`Option ${i + 1}`}
                    placeholder={i < 2 ? `Option ${i + 1}` : `Option ${i + 1} (optional)`}
                    onChange={(e) => setPoll({ ...poll, options: poll.options.map((o, j) => (j === i ? e.target.value : o)) })}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background/60 px-3 text-[15px] placeholder:text-muted-foreground focus:border-brand/60 focus:outline-none"
                  />
                  {poll.options.length > 2 && (
                    <button type="button" aria-label="Remove option" onClick={() => setPoll({ ...poll, options: poll.options.filter((_, j) => j !== i) })} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-elevated hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {poll.options.length < 4 ? (
                <button type="button" onClick={() => setPoll({ ...poll, options: [...poll.options, ""] })} className="flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                  <Plus className="h-4 w-4" /> Add option
                </button>
              ) : <span />}
              <div className="flex items-center gap-1 rounded-lg bg-elevated p-0.5" role="radiogroup" aria-label="Poll length">
                {[1, 6, 24].map((h) => (
                  <button key={h} type="button" role="radio" aria-checked={poll.durationHours === h} onClick={() => setPoll({ ...poll, durationHours: h })} className={cn("h-8 rounded-md px-3 text-[13px] font-semibold transition-colors", poll.durationHours === h ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {h}h
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => setPoll(null)} className="mt-2 text-[13px] font-medium text-infamy hover:underline">Remove poll</button>
          </div>
        )}
        {isPost && parts.map((p, i) => (
          <div key={i} className="relative mt-3 pl-4">
            <span aria-hidden className="absolute bottom-2 left-0 top-[-12px] w-0.5 rounded bg-border" />
            <textarea
              value={p}
              autoFocus
              aria-label={`Thread post ${i + 2}`}
              onChange={(e) => setParts(parts.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder="Add another post"
              rows={2}
              className={cn("block w-full resize-none rounded-xl border border-border bg-background/60 px-4 py-3 pr-10 text-[16px] leading-snug placeholder:text-muted-foreground focus:border-brand/60 focus:outline-none", p.length > LIMIT && "border-infamy")}
            />
            <button type="button" aria-label="Remove post from thread" onClick={() => setParts(parts.filter((_, j) => j !== i))} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-elevated hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
            <span className={cn("absolute bottom-2 right-3 text-[11px] tabular-nums text-muted-foreground", p.length > LIMIT && "text-infamy")}>{p.length}/{LIMIT}</span>
          </div>
        ))}
        <div className="mt-3 flex items-center justify-between gap-3">
          {isPost ? (
            <div className="flex min-w-0 items-center gap-1">
            <Select value={topic} onValueChange={setTopic}>
              <SelectTrigger className="h-9 w-auto gap-2 rounded-lg border-border bg-transparent px-3 text-sm" aria-label="Topic">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="auto">Auto-detect topic</SelectItem>
                {TOPICS.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              aria-label="Add poll"
              title="Poll"
              aria-pressed={!!poll}
              disabled={parts.length > 0}
              onClick={() => setPoll(poll ? null : { options: ["", ""], durationHours: 24 })}
              className={cn("grid h-9 w-9 place-items-center rounded-lg text-brand transition-colors hover:bg-brand/10 disabled:opacity-35", poll && "bg-brand/15")}
            >
              <BarChart2 className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              aria-label="Add post to thread"
              title="Thread"
              disabled={!!poll || parts.length >= 5 || length === 0}
              onClick={() => setParts([...parts, ""])}
              className="grid h-9 w-9 place-items-center rounded-lg text-brand transition-colors hover:bg-brand/10 disabled:opacity-35"
            >
              <Plus className="h-[18px] w-[18px]" />
            </button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter to send</span>
          )}
          <div className="flex items-center gap-3">
            <CharRing length={text.length} />
            <Button onClick={submit} disabled={!canPost} className="h-9 rounded-lg px-5 font-bold">
              {busy && <Loader2 className="animate-spin" />}
              {mode.kind === "reply" ? "Reply" : parts.length ? "Post all" : "Post"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Global dialog for replies, quotes, and quick posts (mobile FAB). */
export function ComposerDialog() {
  const { mode, close } = useComposer();
  return (
    <Dialog open={mode !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-xl gap-0 rounded-2xl border-border bg-card p-5 sm:rounded-2xl">
        <DialogTitle className="mb-1 text-base">{mode?.kind === "reply" ? "Reply" : mode?.kind === "quote" ? "Quote post" : "New post"}</DialogTitle>
        <DialogDescription className="sr-only">Compose a post</DialogDescription>
        {mode?.kind === "reply" && (
          <div className="mb-3 mt-2 flex gap-3 border-l-2 border-border pl-3">
            <div className="min-w-0 text-sm">
              <span className="font-semibold">{mode.target.author.display_name}</span> <span className="text-muted-foreground">@{mode.target.author.username}</span>
              <p className="mt-0.5 line-clamp-3 text-muted-foreground">{mode.target.content}</p>
            </div>
          </div>
        )}
        {mode && <div className="mt-2"><ComposerBox key={mode.kind + (mode.kind !== "post" ? mode.target.id : "")} mode={mode} autoFocus onDone={close} /></div>}
      </DialogContent>
    </Dialog>
  );
}
