import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

export function LanguageToggle() {
  const { language, setLanguage, isRTL } = useLanguage();

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border/40 bg-card/80 p-0.5 shadow-sm sm:gap-2 sm:p-1">
      <Button
        variant={language === "en" ? "default" : "ghost"}
        size="sm"
        onClick={() => setLanguage("en")}
        className={cn(
          "h-7 rounded-full px-2.5 text-xs font-medium transition-all sm:h-8 sm:px-4 sm:text-sm",
          language === "en"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        English
      </Button>
      <Button
        variant={language === "ar" ? "default" : "ghost"}
        size="sm"
        onClick={() => setLanguage("ar")}
        className={cn(
          "h-7 rounded-full px-2.5 text-xs font-medium transition-all sm:h-8 sm:px-4 sm:text-sm",
          language === "ar"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
        dir="rtl"
      >
        العربية
      </Button>
    </div>
  );
}

