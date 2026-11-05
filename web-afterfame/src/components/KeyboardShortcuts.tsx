import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useComposer } from "@/providers/ComposerProvider";
import { useWorld } from "@/providers/WorldProvider";

const SHORTCUTS: [string, string][] = [
  ["N", "New post"],
  ["/", "Search"],
  ["G then H", "Home"],
  ["G then M", "Messages"],
  ["G then N", "Notifications"],
  ["G then F", "Fame"],
  ["G then E", "Events"],
  ["G then S", "Settings"],
  ["G then W", "The simulated web"],
  ["?", "Show this list"],
];

/** Desktop keyboard shortcuts, plus a "?" help sheet. Ignored while typing. */
export function KeyboardShortcuts() {
  const { base } = useWorld();
  const { openPost, mode } = useComposer();
  const navigate = useNavigate();
  const [help, setHelp] = useState<boolean>(false);
  const pendingG = useRef<number>(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || mode) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.closest("[role=dialog]"))) return;
      const k = e.key.toLowerCase();
      if (Date.now() - pendingG.current < 1200) {
        pendingG.current = 0;
        const dest: Record<string, string> = { h: "", m: "/messages", n: "/notifications", f: "/fame", e: "/events", s: "/settings", w: "/site" };
        if (k in dest) {
          e.preventDefault();
          navigate(`${base}${dest[k]}`);
        }
        return;
      }
      if (k === "g") pendingG.current = Date.now();
      else if (k === "n") {
        e.preventDefault();
        openPost();
      } else if (k === "/") {
        const box = document.querySelector<HTMLInputElement>("input[placeholder^='Search']");
        if (box) {
          e.preventDefault();
          box.focus();
        } else navigate(`${base}/discover`);
      } else if (e.key === "?") setHelp(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [base, navigate, openPost, mode]);

  return (
    <Dialog open={help} onOpenChange={setHelp}>
      <DialogContent className="max-w-sm rounded-2xl border-border bg-card">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>Work anywhere outside a text field.</DialogDescription>
        <ul className="divide-y divide-border">
          {SHORTCUTS.map(([k, label]) => (
            <li key={k} className="flex items-center justify-between py-2 text-sm">
              <span>{label}</span>
              <span className="flex gap-1">
                {k.split(" then ").map((p) => (
                  <kbd key={p} className="min-w-6 rounded-md border border-border bg-elevated px-1.5 py-0.5 text-center font-mono text-xs">{p}</kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
