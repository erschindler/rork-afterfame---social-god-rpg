import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { callFn, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useWorld } from "@/providers/WorldProvider";

export function FollowButton({ accountId, username, initial = false, className, size = "sm" }: { accountId: string; username: string; initial?: boolean; className?: string; size?: "sm" | "default" }) {
  const { worldId, refreshSoon } = useWorld();
  const queryClient = useQueryClient();
  const [following, setFollowing] = useState<boolean>(initial);
  const [busy, setBusy] = useState<boolean>(false);
  const [hover, setHover] = useState<boolean>(false);

  const toggle = async () => {
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      const res = await callFn<{ followedBack?: boolean }>("social", { action: next ? "follow" : "unfollow", worldId, accountId });
      if (next && res.followedBack) toast(`@${username} followed you back`);
      queryClient.invalidateQueries({ queryKey: ["profile", worldId] });
      refreshSoon();
    } catch (err) {
      setFollowing(!next);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size={size}
      variant={following ? "outline" : "default"}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggle();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={busy}
      aria-pressed={following}
      className={cn("rounded-full px-4 font-bold", following && "bg-transparent hover:border-infamy/60 hover:bg-infamy/10 hover:text-infamy", className)}
    >
      {busy && <Loader2 className="animate-spin" />}
      {following ? (hover ? "Unfollow" : "Following") : "Follow"}
    </Button>
  );
}
