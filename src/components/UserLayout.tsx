import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserProfile } from "@/components/UserProfile";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const UserLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, isRTL, language } = useLanguage();
  const [navOpen, setNavOpen] = useState(false);

  const menuItems = [
    { key: "home", label: t("home"), path: "/user-dashboard" },
    { key: "courses", label: t("courses"), path: "/courses/card" },
    { key: "subscription", label: t("subscription"), path: "/payments" },
  ];

  const isActive = (path: string) => {
    if (path === "/user-dashboard") {
      return location.pathname === "/" || location.pathname === "/user-dashboard";
    }
    if (path === "/courses/card") {
      return location.pathname.startsWith("/courses");
    }
    return location.pathname.startsWith(path);
  };

  const handleNavigate = (path: string) => {
    setNavOpen(false);
    const searchParams = new URLSearchParams(location.search);
    if (language === "ar") {
      searchParams.set("lang", "ar");
    } else {
      searchParams.delete("lang");
    }
    const queryString = searchParams.toString();
    navigate(`${path}${queryString ? `?${queryString}` : ""}`);
  };

  const navContent = (
    <nav className="flex flex-col gap-1">
      {menuItems.map((item) => (
        <Button
          key={item.key}
          variant={isActive(item.path) ? "default" : "ghost"}
          onClick={() => handleNavigate(item.path)}
          className={cn(
            "h-11 justify-start text-base",
            isActive(item.path) && "bg-pink-500 text-white hover:bg-pink-600"
          )}
        >
          {item.label}
        </Button>
      ))}
    </nav>
  );

  return (
    <div className="relative min-h-screen w-full bg-background" dir={isRTL ? "rtl" : "ltr"}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-cta/5 to-transparent dark:from-primary/5 dark:via-primary/10 dark:to-transparent" />
      <div className="relative z-10 flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-20 flex h-14 min-h-14 shrink-0 items-center gap-2 border-b border-border/40 dark:border-transparent bg-background/80 px-3 backdrop-blur sm:gap-3 sm:px-4 md:gap-4 md:px-6">
          {/* Mobile nav: hamburger + sheet */}
          <div className="md:hidden">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={t("menu") || "Menu"}>
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side={isRTL ? "right" : "left"} className="w-[min(85vw,280px)]">
                <SheetHeader>
                  <SheetTitle className="sr-only">{t("menu") || "Menu"}</SheetTitle>
                </SheetHeader>
                <div className="mt-6">{navContent}</div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Logo */}
          <a
            href={`https://${import.meta.env.VITE_VOD_SITE_URL || "rehamdiva.com"}`}
            className="shrink-0 cursor-pointer transition-opacity hover:opacity-80 flex flex-1 justify-start"
          >
            <img
              src="/RehamDivaLogo.png"
              alt="Reham Diva"
              className="h-9 w-9 rounded-xl object-cover sm:h-10 sm:w-10"
            />
          </a>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-4 md:flex md:gap-6 md:flex-1">
            {menuItems.map((item) => (
              <Button
                key={item.key}
                variant={isActive(item.path) ? "default" : "ghost"}
                onClick={() => handleNavigate(item.path)}
                className={cn(
                  "h-9",
                  isActive(item.path) && "bg-pink-500 text-white hover:bg-pink-600"
                )}
              >
                {item.label}
              </Button>
            ))}
          </nav>

          {/* Right: theme, language, avatar - never wrap, popup won't affect layout */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 md:gap-4">
            <ThemeToggle />
            <LanguageToggle />
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
              <UserProfile />
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default UserLayout;

