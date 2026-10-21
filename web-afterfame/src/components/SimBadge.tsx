import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Disclosure badge on every fictional, simulated account. */
export function SimBadge({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-flex h-[18px] shrink-0 items-center rounded-[5px] bg-elevated px-1.5 text-[10px] font-bold tracking-wider text-muted-foreground ring-1 ring-border", className)}
          aria-label="Simulated account"
        >
          SIM
        </span>
      </TooltipTrigger>
      <TooltipContent>Fictional simulated account</TooltipContent>
    </Tooltip>
  );
}
