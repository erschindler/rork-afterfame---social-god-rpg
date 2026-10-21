import { ChevronDown, Globe2, LogOut, Moon, Settings, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import { useNavigate } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { RANKS } from "@/components/layout/navItems";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/providers/AuthProvider";
import { useWorld } from "@/providers/WorldProvider";

export function AccountMenu() {
  const { player, base, world } = useWorld();
  const { signOut, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  if (!player) return null;
  const level = RANKS.indexOf(player.current_rank) + 1;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex w-full items-start gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-elevated">
          <Avatar seed={player.avatar_reference} size={48} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{player.display_name}</span>
            <span className="block truncate text-sm text-muted-foreground">@{player.username}</span>
            <span className="mt-2 flex items-center justify-between gap-2">
              <span className="rounded-lg bg-elevated px-3 py-1 text-[13px] font-medium ring-1 ring-border">{player.current_rank}</span>
              <span className="text-[13px] text-muted-foreground">Lv {level}</span>
            </span>
          </span>
          <ChevronDown className="mt-1 h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="text-xs text-muted-foreground">Signed in as</div>
          <div className="truncate text-sm">{user?.email}</div>
          {world && <div className="mt-1 truncate text-xs text-muted-foreground">World: {world.name}</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate(`${base}/u/${player.username}`)}>
          <UserRound /> Your profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/worlds")}>
          <Globe2 /> Switch world
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(`${base}/settings`)}>
          <Settings /> World settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme(theme === "light" ? "dark" : "light")}>
          {theme === "light" ? <Moon /> : <Sun />} {theme === "light" ? "Dark mode" : "Light mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
