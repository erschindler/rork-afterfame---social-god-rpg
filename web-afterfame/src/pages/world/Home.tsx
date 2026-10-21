import { Compass, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ComposerBox } from "@/components/Composer";
import { FeedList, type FeedFilter } from "@/components/FeedList";
import { EmptyState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorld } from "@/providers/WorldProvider";

const TABS: { id: FeedFilter; label: string }[] = [
  { id: "for_you", label: "For You" },
  { id: "following", label: "Following" },
  { id: "trending", label: "Trending" },
  { id: "latest", label: "Latest" },
  { id: "communities", label: "Communities" },
];

export default function Home() {
  const [tab, setTab] = useState<FeedFilter>("for_you");
  const { player, base } = useWorld();
  const firstVisit = player && player.post_count === 0;

  return (
    <div>
      <div className="border-b border-border p-4">
        <div className="panel p-4">
          <ComposerBox mode={{ kind: "post" }} inline />
        </div>
        {firstVisit && (
          <div className="mt-3 rounded-2xl border border-brand/30 bg-brand/5 p-4 text-sm animate-rise-in">
            <p className="font-semibold text-brand">You're a nobody. For now.</p>
            <p className="mt-1 text-foreground/80">
              Post something, reply to people, follow accounts you like. Nobody is guaranteed to notice — that's the game. Watch your{" "}
              <Link to={`${base}/fame`} className="font-medium text-brand underline-offset-2 hover:underline">
                fame and reputation
              </Link>{" "}
              respond to what you do.
            </p>
          </div>
        )}
      </div>
      <div role="tablist" aria-label="Feed filters" className="sticky top-14 z-20 flex overflow-x-auto border-b border-border bg-background/85 backdrop-blur-md scrollbar-none lg:top-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("relative min-w-[96px] flex-1 px-4 py-4 text-[15px] font-medium transition-colors hover:bg-elevated/60", tab === t.id ? "text-foreground" : "text-muted-foreground")}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-1/2 bottom-0 h-1 w-14 -translate-x-1/2 rounded-full bg-brand" />}
          </button>
        ))}
      </div>
      <FeedList
        key={tab}
        filter={tab}
        empty={
          tab === "following" ? (
            <EmptyState icon={<UserPlus className="h-5 w-5" />} title="You're not following anyone yet" body="Follow accounts to see their posts here. Following people also makes them more likely to notice you." action={<Button asChild variant="secondary"><Link to={`${base}/discover`}><Compass /> Find people</Link></Button>} />
          ) : undefined
        }
      />
    </div>
  );
}
