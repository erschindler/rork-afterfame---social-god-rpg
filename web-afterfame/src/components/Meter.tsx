import { cn } from "@/lib/utils";

/** Animated progress bar. `tone` maps to an attribute color token. */
export function Meter({ value, max = 100, tone = "fame", className, label }: { value: number; max?: number; tone?: "fame" | "admiration" | "infamy" | "credibility" | "influence" | "controversy"; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  const bg = {
    fame: "bg-fame",
    admiration: "bg-admiration",
    infamy: "bg-infamy",
    credibility: "bg-credibility",
    influence: "bg-influence",
    controversy: "bg-controversy",
  }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} className={cn("h-2 overflow-hidden rounded-full bg-elevated", className)}>
      <div className={cn("h-full origin-left rounded-full animate-bar-grow", bg)} style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%` }} />
    </div>
  );
}
