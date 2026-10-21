import { Feather } from "lucide-react";
import { NavLink } from "react-router-dom";

import { Logo } from "@/components/Logo";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { NAV } from "@/components/layout/navItems";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useComposer } from "@/providers/ComposerProvider";
import { useWorld } from "@/providers/WorldProvider";

export function LeftNav() {
  const { base, unread, player } = useWorld();
  const { openPost } = useComposer();
  return (
    <nav aria-label="Main" className="sticky top-0 flex h-dvh flex-col border-r border-border px-4 pb-4 pt-6">
      <NavLink to={base} className="mb-7 px-3" aria-label="AFTERFAME home">
        <Logo />
      </NavLink>
      <ul className="flex flex-col gap-1 overflow-y-auto scrollbar-none">
        {NAV.map((item) => {
          const to = item.to === "/me" ? `${base}/u/${player?.username ?? ""}` : `${base}${item.to}`;
          return (
            <li key={item.label}>
              <NavLink
                to={to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-4 rounded-xl px-4 py-2.5 text-[17px] transition-colors hover:bg-elevated",
                    isActive ? "bg-elevated font-semibold text-brand" : "text-foreground/90",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={cn("h-[22px] w-[22px] transition-transform group-hover:scale-105", isActive && "fill-brand/20")} strokeWidth={isActive ? 2.4 : 1.9} />
                    <span>{item.label}</span>
                    {item.badge === "unread" && unread > 0 && (
                      <span className="ml-auto grid h-[22px] min-w-[22px] place-items-center rounded-full bg-infamy px-1.5 text-xs font-bold text-white" aria-label={`${unread} unread`}>
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
      <Button onClick={() => openPost()} className="mt-5 h-12 rounded-xl text-base font-bold">
        <Feather /> Post
      </Button>
      <div className="mt-auto border-t border-border pt-4">
        <AccountMenu />
      </div>
    </nav>
  );
}
