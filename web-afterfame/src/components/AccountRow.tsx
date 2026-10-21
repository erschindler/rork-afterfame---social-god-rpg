import { Link } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { FollowButton } from "@/components/FollowButton";
import { SimBadge } from "@/components/SimBadge";
import { compact } from "@/lib/format";
import type { AccountCard } from "@/lib/types";
import { useWorld } from "@/providers/WorldProvider";

export function AccountRow({ account, showFollow = true }: { account: AccountCard; showFollow?: boolean }) {
  const { base } = useWorld();
  return (
    <Link to={`${base}/u/${account.username}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-elevated/60">
      <Avatar seed={account.avatar} size={46} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-bold">{account.display_name}</span>
          {account.is_simulated && <SimBadge />}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          @{account.username} · {account.label} · {compact(account.followers)} followers
        </p>
        {account.bio && <p className="mt-0.5 line-clamp-1 text-sm text-foreground/80">{account.bio}</p>}
      </div>
      {showFollow && account.is_simulated && <FollowButton accountId={account.id} username={account.username} />}
    </Link>
  );
}
