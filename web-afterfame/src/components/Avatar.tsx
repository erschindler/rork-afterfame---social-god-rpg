import {
  adventurer,
  avataaars,
  bigEars,
  bigSmile,
  bottts,
  croodles,
  dylan,
  lorelei,
  micah,
  miniavs,
  notionists,
  openPeeps,
  personas,
  pixelArt,
  thumbs,
  toonHead,
} from "@dicebear/collection";
import { createAvatar, type Style } from "@dicebear/core";
import { memo, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

const BACKGROUNDS = ["f4a261", "8ecae6", "e9c46a", "f7b2c4", "a7c4a0", "c3b1e1", "ffb38a", "9ad1d4", "d4d4c8"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStyle = Style<any>;

/** Generated avatar styles. References look like "style:seed"; a bare seed means notionists. */
export const AVATAR_STYLES: { id: string; label: string; style: AnyStyle; scale?: number }[] = [
  { id: "notionists", label: "Sketch", style: notionists, scale: 110 },
  { id: "lorelei", label: "Line art", style: lorelei },
  { id: "adventurer", label: "Adventurer", style: adventurer },
  { id: "personas", label: "Personas", style: personas },
  { id: "micah", label: "Micah", style: micah },
  { id: "avataaars", label: "Cartoon", style: avataaars },
  { id: "openPeeps", label: "Open Peeps", style: openPeeps },
  { id: "bigSmile", label: "Big smile", style: bigSmile },
  { id: "bigEars", label: "Big ears", style: bigEars },
  { id: "toonHead", label: "Toon", style: toonHead },
  { id: "dylan", label: "Dylan", style: dylan },
  { id: "miniavs", label: "Mini", style: miniavs },
  { id: "croodles", label: "Doodle", style: croodles },
  { id: "pixelArt", label: "Pixel", style: pixelArt },
  { id: "thumbs", label: "Thumbs", style: thumbs },
  { id: "bottts", label: "Robot", style: bottts },
];
const BY_ID = new Map(AVATAR_STYLES.map((s) => [s.id, s]));

export function parseAvatar(ref: string): { styleId: string; seed: string } {
  const i = ref.indexOf(":");
  if (i > 0 && BY_ID.has(ref.slice(0, i))) return { styleId: ref.slice(0, i), seed: ref.slice(i + 1) };
  return { styleId: "notionists", seed: ref };
}

export const isPhotoAvatar = (ref: string) => /^https:\/\//.test(ref);

const cache = new Map<string, string>();

/** Deterministic illustrated avatar generated locally from a reference. No network calls. */
export function avatarUri(ref: string): string {
  if (isPhotoAvatar(ref)) return ref;
  const hit = cache.get(ref);
  if (hit) return hit;
  const { styleId, seed } = parseAvatar(ref);
  const s = BY_ID.get(styleId) ?? AVATAR_STYLES[0];
  const uri = createAvatar(s.style, { seed, backgroundColor: BACKGROUNDS, backgroundType: ["solid"], scale: s.scale ?? 100 }).toDataUri();
  if (cache.size > 800) cache.clear();
  cache.set(ref, uri);
  return uri;
}

interface AvatarProps {
  seed: string;
  size?: number;
  className?: string;
  ring?: boolean;
  alt?: string;
}

export const Avatar = memo(function Avatar({ seed, size = 44, className, ring, alt = "" }: AvatarProps) {
  const [failed, setFailed] = useState<boolean>(false);
  const src = useMemo(() => (failed ? avatarUri(`notionists:${seed}`) : avatarUri(seed)), [seed, failed]);
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      onError={() => isPhotoAvatar(seed) && setFailed(true)}
      className={cn("shrink-0 rounded-full bg-elevated object-cover", ring && "ring-2 ring-background", className)}
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
});
