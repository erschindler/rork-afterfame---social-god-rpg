import { Award, Bell, Bookmark, Compass, Home, Settings, BarChart3, Users, UserRound, Zap, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: "unread";
  end?: boolean;
}

export const NAV: NavItem[] = [
  { to: "", label: "Home", icon: Home, end: true },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/notifications", label: "Notifications", icon: Bell, badge: "unread" },
  { to: "/communities", label: "Communities", icon: Users },
  { to: "/fame", label: "Fame", icon: BarChart3 },
  { to: "/events", label: "World Events", icon: Zap },
  { to: "/achievements", label: "Achievements", icon: Award },
  { to: "/bookmarks", label: "Bookmarks", icon: Bookmark },
  { to: "/me", label: "Profile", icon: UserRound },
  { to: "/settings", label: "World Settings", icon: Settings },
];

export const MOBILE_NAV: NavItem[] = [
  { to: "", label: "Home", icon: Home, end: true },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/events", label: "Events", icon: Zap },
  { to: "/notifications", label: "Alerts", icon: Bell, badge: "unread" },
  { to: "/fame", label: "Fame", icon: BarChart3 },
];

export const RANKS = ["Nobody", "Recognized", "Rising Name", "Notable", "Celebrity", "Cultural Force", "Legend"];
