import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useState } from "react";

import type { PostView } from "@/lib/types";

export type ComposerMode = { kind: "reply"; target: PostView } | { kind: "quote"; target: PostView } | { kind: "post"; prefill?: string } | null;

/** Opens the reply / quote / new-post dialog from anywhere in a world. */
export const [ComposerProvider, useComposer] = createContextHook(() => {
  const [mode, setMode] = useState<ComposerMode>(null);
  const openReply = useCallback((target: PostView) => setMode({ kind: "reply", target }), []);
  const openQuote = useCallback((target: PostView) => setMode({ kind: "quote", target }), []);
  const openPost = useCallback((prefill?: string) => setMode({ kind: "post", prefill }), []);
  const close = useCallback(() => setMode(null), []);
  return { mode, openReply, openQuote, openPost, close };
});
