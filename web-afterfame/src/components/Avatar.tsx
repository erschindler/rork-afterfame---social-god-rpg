import { notionists } from "@dicebear/collection";
import { createAvatar } from "@dicebear/core";
import { memo, useMemo } from "react";

import { cn } from "@/lib/utils";

const BACKGROUNDS = ["f4a261", "8ecae6", "e9c46a", "f7b2c4", "a7c4a0", "c3b1e1", "ffb38a", "9ad1d4", "d4d4c8"];

const cache = new Map<string, string>();

/** Deterministic illustrated avatar generated locally from a seed. No network calls. */
export function avatarUri(seed: string): string {
  const hit = cache.get(seed);
  if (hit) return hit;
  const uri = createAvatar(notionists, { seed, backgroundColor: BACKGROUNDS, backgroundType: ["solid"], scale: 110 }).toDataUri();
  cache.set(seed, uri);
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
  const src = useMemo(() => avatarUri(seed), [seed]);
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full bg-elevated object-cover", ring && "ring-2 ring-background", className)}
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
});
