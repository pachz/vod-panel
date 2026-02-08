import {
  LayoutDashboard,
  FolderTree,
  BookOpen,
  GraduationCap,
  PlayCircle,
  Users,
  CreditCard,
  UserRound,
  PanelsTopLeft,
} from "lucide-react";
import { Link, matchPath, useLocation } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type MenuItem = {
  title: string;
  url: string;
  icon: LucideIcon;
};

const adminMenuItems: MenuItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Categories", url: "/categories", icon: FolderTree },
  { title: "Courses", url: "/courses", icon: BookOpen },
  { title: "Lessons", url: "/lessons", icon: GraduationCap },
  { title: "Coaches", url: "/coaches", icon: UserRound },
  // { title: "Video Panel", url: "/video-panel", icon: PlayCircle },
  { title: "Users", url: "/users", icon: Users },
  { title: "Payments", url: "/payments", icon: CreditCard },
];

const memberMenuItems: MenuItem[] = [
  { title: "Courses", url: "/courses/card", icon: PanelsTopLeft },
  { title: "Subscription", url: "/payments", icon: CreditCard },
];

export function AdminSidebar() {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentUser = useQuery(api.user.getCurrentUser);
  const isAdmin = currentUser?.isGod ?? false;
  const isLoadingUser = currentUser === undefined;
  const menuItems = isLoadingUser ? memberMenuItems : isAdmin ? adminMenuItems : memberMenuItems;

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar collapsible="offcanvas" className="border-none bg-transparent">
      <SidebarContent className="sidebar-panel">
        {/* Logo Header */}
        <div className="px-5 py-6 transition-all duration-300">
          <a
            href={`https://${import.meta.env.VITE_VOD_SITE_URL || "rehamdiva.com"}`}
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <img
              src="/RehamDivaLogo.png"
              alt="Reham Diva"
              className={cn(
                "rounded-xl object-cover transition-all duration-300",
                collapsed ? "h-10 w-10" : "h-12 w-12",
              )}
            />
            {!collapsed && (
              <div className="space-y-1">
                <h2 className="font-semibold text-base tracking-tight">Reham Diva</h2>
                <p className="text-xs text-sidebar-foreground/60">
                  {isLoadingUser ? "User Panel" : isAdmin ? "Admin Panel" : "User Panel"}
                </p>
              </div>
            )}
          </a>
        </div>

        {/* Menu Items */}
        <SidebarGroup className="px-3">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {menuItems.map((item) => {
                // For exact matches like /dashboard, check both exact and with wildcard
                const exactMatch = matchPath({ path: item.url, end: true }, location.pathname);
                const patternMatch = matchPath({ path: `${item.url}/*`, end: false }, location.pathname);
                const isActive = Boolean(exactMatch || patternMatch);

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={cn(
                        "h-11 rounded-2xl transition-all duration-300 hover:shadow-[0_12px_30px_-12px_hsl(var(--sidebar-primary)/0.6)]",
                        "data-[active=true]:border data-[active=true]:border-primary/30 data-[active=true]:bg-[color:hsl(var(--sidebar-primary)/0.12)] data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[0_10px_28px_-14px_hsl(var(--sidebar-primary)/0.7)]",
                        "data-[active=false]:text-sidebar-foreground/70 data-[active=false]:hover:bg-[color:hsl(var(--sidebar-accent)/0.12)] data-[active=false]:hover:text-sidebar-foreground",
                      )}
                    >
                      <Link to={item.url} onClick={handleLinkClick} className="flex w-full items-center gap-3">
                        <item.icon
                          className={cn(
                            "h-5 w-5 transition-colors duration-200",
                            isActive ? "text-primary" : "text-sidebar-foreground/60",
                          )}
                        />
                        {!collapsed && (
                          <>
                            <span
                              className={cn(
                                "text-sm font-medium tracking-wide transition-colors duration-200",
                                isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/75",
                              )}
                            >
                              {item.title}
                            </span>
                          </>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
