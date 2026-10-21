import { cn } from "@/lib/utils";

export function Logo({ className, tagline = true, size = "md" }: { className?: string; tagline?: boolean; size?: "sm" | "md" | "lg" }) {
  const text = size === "lg" ? "text-5xl md:text-6xl" : size === "sm" ? "text-xl" : "text-[28px]";
  return (
    <div className={cn("select-none leading-none", className)}>
      <div className={cn("font-display font-black tracking-tight", text)}>
        <span className="text-foreground">AFTER</span>
        <span className="text-brand">FAME</span>
      </div>
      {tagline && <div className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-brand">Post. Play. Be remembered.</div>}
    </div>
  );
}
