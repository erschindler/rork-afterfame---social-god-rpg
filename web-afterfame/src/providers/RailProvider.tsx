import createContextHook from "@nkzw/create-context-hook";
import { type ReactNode, useEffect, useState } from "react";

/** Lets a detail page replace the right rail on wide screens (e.g. post spread analysis). */
export const [RailProvider, useRail] = createContextHook(() => {
  const [override, setOverride] = useState<ReactNode | null>(null);
  return { override, setOverride };
});

export function useRailOverride(node: ReactNode | null, deps: unknown[]): void {
  const { setOverride } = useRail();
  useEffect(() => {
    setOverride(node);
    return () => setOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
