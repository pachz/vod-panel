import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";

import LoginPage from "./LoginPage";
import Dashboard from "@/pages/Dashboard";
import UserDashboard from "@/pages/UserDashboard";
import Categories from "@/pages/Categories";
import Courses from "@/pages/Courses";
import CourseCards from "@/pages/CourseCards";
import CourseDetail from "@/pages/CourseDetail";
import CoursePreview from "@/pages/CoursePreview";
import Lessons from "@/pages/Lessons";
import LessonDetail from "@/pages/LessonDetail";
import NotFound from "@/pages/NotFound";
import VideoPanel from "@/pages/VideoPanel";
import Users from "@/pages/Users";
import UserInfo from "@/pages/UserInfo";
import Payments from "@/pages/Payments";
import Coaches from "@/pages/Coaches";
import CoachDetail from "@/pages/CoachDetail";
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
import { UserProfile } from "@/components/UserProfile";
import UserLayout from "@/components/UserLayout";
import { api } from "../convex/_generated/api";
import AnalyticsListener from "@/components/AnalyticsListener";
import { useLanguage } from "@/hooks/use-language";

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

const AdminRoute = () => {
  const currentUser = useQuery(api.user.getCurrentUser);
  const location = useLocation();

  if (currentUser === undefined) {
    return <LoadingScreen />;
  }

  if (!currentUser?.isGod) {
    return <Navigate to="/" replace state={{ from: location }} />;
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

const UserProviders = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="light" storageKey="coursehub-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <UserLayout />
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

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
  return (
    <div className="relative min-h-screen w-full bg-background">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-cta/5 to-transparent dark:from-primary/5 dark:via-primary/10 dark:to-transparent" />
      <div className="relative z-10 flex min-h-screen w-full">
        <AdminSidebar />
        <main className="flex flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border/40 dark:border-transparent bg-background/80 px-6 backdrop-blur">
            <SidebarTrigger />
            <div className="flex-1" />
            <ThemeToggle />
            <UserProfile />
          </header>
          <div className="flex-1 overflow-y-auto p-6 md:p-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

const RootRedirect = () => {
  const currentUser = useQuery(api.user.getCurrentUser);
  const location = useLocation();

  if (currentUser === undefined) {
    return <LoadingScreen />;
  }

  if (currentUser?.isGod) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/user-dashboard" replace />;
};

const LanguageDirectionEffect = () => {
  const { language, isRTL } = useLanguage();

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("lang", language);
    html.setAttribute("dir", isRTL ? "rtl" : "ltr");
  }, [language, isRTL]);

  return null;
};

const App = () => (
  <>
    <LanguageDirectionEffect />
    <AnalyticsListener />
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<PrivateRoute />}>
        {/* Admin routes - with sidebar */}
        <Route element={<DashboardProviders />}>
          <Route element={<AdminRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/courses/:id" element={<CourseDetail />} />
            <Route path="/lessons" element={<Lessons />} />
            <Route path="/lessons/:id" element={<LessonDetail />} />
            <Route path="/video-panel" element={<VideoPanel />} />
            <Route path="/coaches" element={<Coaches />} />
            <Route path="/coaches/:id" element={<CoachDetail />} />
            <Route path="/users" element={<Users />} />
            <Route path="/users/:id/info" element={<UserInfo />} />
          </Route>
        </Route>
        {/* Normal user routes - no sidebar */}
        <Route element={<UserProviders />}>
          <Route path="/user-dashboard" element={<UserDashboard />} />
          <Route path="/courses/card" element={<CourseCards />} />
          <Route path="/courses/preview/:id" element={<CoursePreview />} />
          <Route path="/payments" element={<Payments />} />
        </Route>
        {/* Root redirect */}
        <Route path="/" element={<RootRedirect />} />
        {/* Catch-all */}
        <Route element={<DashboardProviders />}>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  </>
);

export default App;
