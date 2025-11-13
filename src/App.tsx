import { useCallback, useMemo, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import LoginPage from "./LoginPage";
import Dashboard from "@/pages/Dashboard";
import Categories from "@/pages/Categories";
import Courses from "@/pages/Courses";
import CourseDetail from "@/pages/CourseDetail";
import Lessons from "@/pages/Lessons";
import NotFound from "@/pages/NotFound";
import VideoPanel from "@/pages/VideoPanel";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import {
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { Button } from "@/components/ui/button";

type LocationState = {
  from?: {
    pathname?: string;
    search?: string;
    hash?: string;
  };
};

const queryClient = new QueryClient();

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="rounded-3xl border border-border/40 bg-card/70 px-10 py-8 shadow-card">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  </div>
);

const PrivateRoute = () => {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    const redirectTarget = `${location.pathname}${location.search}${location.hash}`;
    const searchParams = new URLSearchParams();
    searchParams.set("redirect", redirectTarget || "/");

    return (
      <Navigate
        to={`/login?${searchParams.toString()}`}
        replace
        state={{ from: location }}
      />
    );
  }

  return <Outlet />;
};

const PublicRoute = () => {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const redirectFromQuery = new URLSearchParams(location.search).get("redirect");

  const redirectFromState = state?.from
    ? `${state.from.pathname ?? ""}${state.from.search ?? ""}${state.from.hash ?? ""}`
    : undefined;

  const redirectPath =
    redirectFromQuery?.startsWith("/") ? redirectFromQuery : redirectFromState?.startsWith("/") ? redirectFromState : "/";

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to={redirectPath} replace />;
  }

  return <Outlet />;
};

const DashboardProviders = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="light" storageKey="coursehub-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <SidebarProvider>
          <DashboardLayout />
        </SidebarProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

const DashboardLayout = () => {
  const { signOut } = useAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  }, [isSigningOut, signOut]);

  const signOutLabel = useMemo(
    () => (isSigningOut ? "Signing out…" : "Sign out"),
    [isSigningOut],
  );

  return (
    <div className="relative min-h-screen w-full bg-background">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-cta/5 to-transparent dark:from-primary/5 dark:via-primary/10 dark:to-transparent" />
      <div className="relative z-10 flex min-h-screen w-full">
        <AdminSidebar />
        <main className="flex flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border/40 bg-background/80 px-6 backdrop-blur">
            <SidebarTrigger />
            <div className="flex-1" />
            <ThemeToggle />
            <Button
              variant="outline"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="border-border/60"
            >
              {signOutLabel}
            </Button>
          </header>
          <div className="flex-1 overflow-y-auto p-6 md:p-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

const App = () => (
  <Routes>
    <Route element={<PublicRoute />}>
      <Route path="/login" element={<LoginPage />} />
    </Route>
    <Route element={<PrivateRoute />}>
      <Route element={<DashboardProviders />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/courses/:id" element={<CourseDetail />} />
        <Route path="/lessons" element={<Lessons />} />
        <Route path="/video-panel" element={<VideoPanel />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Route>
  </Routes>
);

export default App;
