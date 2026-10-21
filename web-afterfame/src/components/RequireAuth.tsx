import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/providers/AuthProvider";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" aria-label="Loading" />
      </div>
    );
  }
  if (!session) return <Navigate to={`/auth?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}
