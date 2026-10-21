import { Feather, Menu } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { MOBILE_NAV, NAV } from "@/components/layout/navItems";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useComposer } from "@/providers/ComposerProvider";
import { useWorld } from "@/providers/WorldProvider";

export function MobileHeader() {
  const { player, base } = useWorld();
  const [open, setOpen] = useState<boolean>(false);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-md lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button type="button" aria-label="Open menu" className="grid h-10 w-10 place-items-center rounded-full">
            {player ? <Avatar seed={player.avatar_reference} size={34} /> : <Menu />}
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-[300px] flex-col border-border bg-background p-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navigate your world</SheetDescription>
          <Logo className="mb-6 px-2 pt-2" />
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => (
              <li key={item.label}>
                <NavLink
                  to={item.to === "/me" ? `${base}/u/${player?.username ?? ""}` : `${base}${item.to}`}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => cn("flex items-center gap-4 rounded-xl px-3 py-3 text-[16px]", isActive ? "bg-elevated font-semibold text-brand" : "")}
                >
                  <item.icon className="h-5 w-5" /> {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mt-auto border-t border-border pt-3">
            <AccountMenu />
          </div>
        </SheetContent>
      </Sheet>
      <NavLink to={base} aria-label="Home">
        <Logo tagline={false} size="sm" />
      </NavLink>
      <span className="w-10" />
    </header>
  );
}

export function MobileTabBar() {
  const { base, unread } = useWorld();
  const { openPost } = useComposer();
  return (
    <>
      <button
        type="button"
        onClick={() => openPost()}
        aria-label="New post"
        className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/40 transition-transform active:scale-95 lg:hidden"
      >
        <Feather className="h-6 w-6" />
      </button>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <ul className="grid grid-cols-5">
          {MOBILE_NAV.map((item) => (
            <li key={item.label}>
              <NavLink
                to={`${base}${item.to}`}
                end={item.end}
                className={({ isActive }) => cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", isActive ? "text-brand" : "text-muted-foreground")}
              >
                <item.icon className="h-[22px] w-[22px]" />
                {item.label}
                {item.badge === "unread" && unread > 0 && <span className="absolute right-[calc(50%-18px)] top-2.5 h-2.5 w-2.5 rounded-full bg-infamy ring-2 ring-background" aria-label={`${unread} unread`} />}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
