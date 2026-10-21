import { Loader2 } from "lucide-react";
import { Link, Outlet } from "react-router-dom";

import { ComposerDialog } from "@/components/Composer";
import { LeftNav } from "@/components/layout/LeftNav";
import { MobileHeader, MobileTabBar } from "@/components/layout/MobileChrome";
import { RightRail, SearchBox } from "@/components/layout/RightRail";
import { OfflineSummaryDialog } from "@/components/OfflineSummaryDialog";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { ComposerProvider } from "@/providers/ComposerProvider";
import { RailProvider, useRail } from "@/providers/RailProvider";
import { useWorld, WorldProvider } from "@/providers/WorldProvider";

function Shell() {
  const { isLoading, error, data, refetch } = useWorld();
  const { override } = useRail();
  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
          <p className="text-sm">Catching up with your world…</p>
        </div>
      </div>
    );
  }
  if (error || !data) {
    const forbidden = error instanceof ApiError && (error.code === "forbidden" || error.code === "invalid_input");
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="text-center">
          <ErrorState error={forbidden ? new Error("This world doesn't exist or you don't have access to it.") : error} onRetry={forbidden ? undefined : () => refetch()} />
          <Button asChild variant="secondary">
            <Link to="/worlds">Back to your worlds</Link>
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1320px] justify-center">
      <div className="hidden w-[275px] shrink-0 lg:block">
        <LeftNav />
      </div>
      <main id="main" className="min-w-0 flex-1 border-border pb-24 lg:max-w-[640px] lg:border-r lg:pb-0">
        <MobileHeader />
        <Outlet />
      </main>
      <div className="hidden w-[360px] shrink-0 pl-6 pr-2 xl:block">
        {override ? (
          <aside className="sticky top-0 flex h-dvh flex-col gap-4 overflow-y-auto px-1 pb-8 pt-4 scrollbar-none [&>*]:shrink-0">
            <SearchBox />
            {override}
          </aside>
        ) : (
          <RightRail />
        )}
      </div>
      <MobileTabBar />
      <ComposerDialog />
      <OfflineSummaryDialog />
    </div>
  );
}

export function WorldLayout() {
  return (
    <WorldProvider>
      <ComposerProvider>
        <RailProvider>
          <Shell />
        </RailProvider>
      </ComposerProvider>
    </WorldProvider>
  );
}
