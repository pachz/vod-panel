import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { LanguageToggle } from "@/components/LanguageToggle";
import { UserProfile } from "@/components/UserProfile";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const UserLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, isRTL, language } = useLanguage();

  const menuItems = [
    { key: "home", label: t("home"), path: "/user-dashboard" },
    { key: "courses", label: t("courses"), path: "/courses/card" },
    { key: "subscription", label: t("subscription"), path: "/payments" },
  ];

  const isActive = (path: string) => {
    // For home, match both "/" and "/user-dashboard"
    if (path === "/user-dashboard") {
      return location.pathname === "/" || location.pathname === "/user-dashboard";
    }
    // For courses, also match /courses/preview/:id
    if (path === "/courses/card") {
      return location.pathname.startsWith("/courses");
    }
    return location.pathname.startsWith(path);
  };

  const handleNavigate = (path: string) => {
    const searchParams = new URLSearchParams(location.search);
    if (language === "ar") {
      searchParams.set("lang", "ar");
    } else {
      searchParams.delete("lang");
    }
    const queryString = searchParams.toString();
    navigate(`${path}${queryString ? `?${queryString}` : ""}`);
  };

  return (
    <div className="relative min-h-screen w-full bg-background" dir={isRTL ? "rtl" : "ltr"}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-cta/5 to-transparent dark:from-primary/5 dark:via-primary/10 dark:to-transparent" />
      <div className="relative z-10 flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border/40 dark:border-transparent bg-background/80 px-6 backdrop-blur">
          <a
            href="https://vod.borj.dev"
            className="cursor-pointer hover:opacity-80 transition-opacity"
          >
            <img
              src="/RehamDivaLogo.png"
              alt="Reham Diva"
              className="h-10 w-10 rounded-xl object-cover"
            />
          </a>
          <nav className="flex items-center gap-6 flex-1">
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
          <div className="flex items-center gap-4">
            <LanguageToggle />
            <UserProfile />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6 md:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default UserLayout;

