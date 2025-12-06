import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

export function LanguageToggle() {
  const { language, setLanguage, isRTL } = useLanguage();

  return (
    <div className="flex items-center gap-2 rounded-full border border-border/40 bg-card/80 p-1 shadow-sm">
      <Button
        variant={language === "en" ? "default" : "ghost"}
        size="sm"
        onClick={() => setLanguage("en")}
        className={cn(
          "h-8 rounded-full px-4 text-sm font-medium transition-all",
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
          "h-8 rounded-full px-4 text-sm font-medium transition-all",
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

