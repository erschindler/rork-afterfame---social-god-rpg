import { AlertTriangle, Flame, Heart, ShieldCheck, Trophy, Users, Anchor, Target, Link2, type LucideIcon } from "lucide-react";

export type Tone = "fame" | "admiration" | "infamy" | "credibility" | "influence" | "controversy";

export const ATTRS: { key: string; label: string; icon: LucideIcon; tone: Tone; text: string; blurb: string }[] = [
  { key: "fame", label: "Fame", icon: Trophy, tone: "fame", text: "text-fame", blurb: "How widely you're recognized, especially beyond your followers." },
  { key: "admiration", label: "Admiration", icon: Heart, tone: "admiration", text: "text-admiration", blurb: "Positive sentiment and respect from the people who see you." },
  { key: "infamy", label: "Infamy", icon: Flame, tone: "infamy", text: "text-infamy", blurb: "Notoriety from negative attention. Raises recognition, erodes trust." },
  { key: "credibility", label: "Credibility", icon: ShieldCheck, tone: "credibility", text: "text-credibility", blurb: "Whether people consider you reliable. Experts and journalists judge this." },
  { key: "influence", label: "Influence", icon: Users, tone: "influence", text: "text-influence", blurb: "Your ability to move conversations. Derived from reach, trust and connections." },
  { key: "controversy", label: "Controversy", icon: AlertTriangle, tone: "controversy", text: "text-controversy", blurb: "How much disagreement surrounds you right now. Cools over time." },
];

export const SECONDARY: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "audience_loyalty", label: "Audience loyalty", icon: Anchor },
  { key: "niche_authority", label: "Niche authority", icon: Target },
  { key: "connection_strength", label: "Connections", icon: Link2 },
];

export const attrMeta = (key: string) => ATTRS.find((a) => a.key === key) ?? SECONDARY.map((s) => ({ ...s, tone: "fame" as Tone, text: "text-muted-foreground", blurb: "" })).find((s) => s.key === key);

export const RANK_COPY: Record<string, string> = {
  Nobody: "Nobody knows your name yet. Everyone starts here.",
  Recognized: "A few circles know who you are.",
  "Rising Name": "Growing recognition. Keep posting, keep building.",
  Notable: "People outside your niche are starting to notice.",
  Celebrity: "Your name travels without you.",
  "Cultural Force": "You shape the conversations other people have.",
  Legend: "Part of the world's history now.",
};
