import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { WorldLayout } from "@/components/layout/WorldLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";
import { AuthProvider } from "@/providers/AuthProvider";

import Auth from "./pages/Auth";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";

const Worlds = lazy(() => import("./pages/Worlds"));
const CreateWorld = lazy(() => import("./pages/CreateWorld"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Home = lazy(() => import("./pages/world/Home"));
const Discover = lazy(() => import("./pages/world/Discover"));
const Notifications = lazy(() => import("./pages/world/Notifications"));
const Fame = lazy(() => import("./pages/world/Fame"));
const Events = lazy(() => import("./pages/world/Events"));
const Thread = lazy(() => import("./pages/world/Thread"));
const Profile = lazy(() => import("./pages/world/Profile"));
const Achievements = lazy(() => import("./pages/world/Achievements"));
const Bookmarks = lazy(() => import("./pages/world/Bookmarks"));
const Relationships = lazy(() => import("./pages/world/Relationships"));
const Settings = lazy(() => import("./pages/world/Settings"));
const CommunitiesPage = lazy(() => import("./pages/world/Communities").then((m) => ({ default: m.CommunitiesPage })));
const CommunityPage = lazy(() => import("./pages/world/Communities").then((m) => ({ default: m.CommunityPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

const Fallback = () => <div className="min-h-[50vh]" aria-busy="true" />;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" themes={["dark", "light"]} enableSystem={false}>
      <TooltipProvider delayDuration={250}>
        <AuthProvider>
          <Toaster position="bottom-center" />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Suspense fallback={<Fallback />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/worlds" element={<RequireAuth><Worlds /></RequireAuth>} />
                <Route path="/worlds/new" element={<RequireAuth><CreateWorld /></RequireAuth>} />
                <Route path="/w/:worldId" element={<RequireAuth><WorldLayout /></RequireAuth>}>
                  <Route index element={<Suspense fallback={<Fallback />}><Home /></Suspense>} />
                  <Route path="discover" element={<Suspense fallback={<Fallback />}><Discover /></Suspense>} />
                  <Route path="notifications" element={<Suspense fallback={<Fallback />}><Notifications /></Suspense>} />
                  <Route path="communities" element={<Suspense fallback={<Fallback />}><CommunitiesPage /></Suspense>} />
                  <Route path="c/:slug" element={<Suspense fallback={<Fallback />}><CommunityPage /></Suspense>} />
                  <Route path="fame" element={<Suspense fallback={<Fallback />}><Fame /></Suspense>} />
                  <Route path="relationships" element={<Suspense fallback={<Fallback />}><Relationships /></Suspense>} />
                  <Route path="events" element={<Suspense fallback={<Fallback />}><Events /></Suspense>} />
                  <Route path="achievements" element={<Suspense fallback={<Fallback />}><Achievements /></Suspense>} />
                  <Route path="bookmarks" element={<Suspense fallback={<Fallback />}><Bookmarks /></Suspense>} />
                  <Route path="settings" element={<Suspense fallback={<Fallback />}><Settings /></Suspense>} />
                  <Route path="post/:postId" element={<Suspense fallback={<Fallback />}><Thread /></Suspense>} />
                  <Route path="u/:username" element={<Suspense fallback={<Fallback />}><Profile /></Suspense>} />
                  <Route path="*" element={<Navigate to="." replace />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
