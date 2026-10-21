import { Fragment, memo } from "react";
import { Link } from "react-router-dom";

import { useWorld } from "@/providers/WorldProvider";

/** Renders post text with linked @mentions and #hashtags. */
export const RichText = memo(function RichText({ text, className }: { text: string; className?: string }) {
  const { base } = useWorld();
  const parts = text.split(/([@#][A-Za-z0-9_]{2,30})/g);
  return (
    <p className={className}>
      {parts.map((part, i) => {
        if (/^@[A-Za-z0-9_]{2,30}$/.test(part)) {
          return (
            <Link key={i} to={`${base}/u/${part.slice(1).toLowerCase()}`} onClick={(e) => e.stopPropagation()} className="font-medium text-brand hover:underline">
              {part}
            </Link>
          );
        }
        if (/^#[A-Za-z][A-Za-z0-9_]{1,30}$/.test(part)) {
          return (
            <Link key={i} to={`${base}/discover?q=${encodeURIComponent(part)}`} onClick={(e) => e.stopPropagation()} className="font-medium text-brand hover:underline">
              {part}
            </Link>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </p>
  );
});
