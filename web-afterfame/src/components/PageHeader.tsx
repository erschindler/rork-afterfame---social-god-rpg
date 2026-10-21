import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";

/** Sticky page header for the center column. */
export function PageHeader({ title, subtitle, back, right, className, children }: { title: string; subtitle?: string; back?: boolean | string; right?: ReactNode; className?: string; children?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className={cn("sticky top-14 z-20 border-b border-border bg-background/85 backdrop-blur-md lg:top-0", className)}>
      <div className="flex min-h-[60px] items-center gap-3 px-4 py-2">
        {back && (
          <button
            type="button"
            aria-label="Back"
            onClick={() => (typeof back === "string" ? navigate(back) : window.history.length > 1 ? navigate(-1) : navigate(".."))}
            className="-ml-2 grid h-10 w-10 place-items-center rounded-full hover:bg-elevated"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}
