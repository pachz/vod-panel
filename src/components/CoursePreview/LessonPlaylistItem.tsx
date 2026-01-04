import { forwardRef } from "react";
import { CheckCircle2, Circle, Clock, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Doc } from "../../../convex/_generated/dataModel";

type LessonDoc = Doc<"lessons">;

type LessonPlaylistItemProps = {
  lesson: LessonDoc;
  index: number;
  isActive: boolean;
  isCompleted: boolean;
  lessonTitle: string;
  duration: number | undefined | null;
  onClick: () => void;
  isRTL: boolean;
  t: (key: string) => string;
  formatDuration: (minutes: number | undefined | null, t: (key: string) => string) => string;
};

export const LessonPlaylistItem = forwardRef<HTMLButtonElement, LessonPlaylistItemProps>(({
  lesson,
  index,
  isActive,
  isCompleted,
  lessonTitle,
  duration,
  onClick,
  isRTL,
  t,
  formatDuration,
}, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 transition hover:border-primary/40",
        isRTL ? "flex-row-reverse" : "",
        isActive
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border/40 dark:border-transparent bg-background/60",
      )}
      dir={isRTL ? "rtl" : "ltr"}
    >
      {isCompleted ? (
        <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
      ) : (
        <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
      )}
      <div
        className={cn("flex-1", isRTL ? "text-right" : "text-left")}
        dir={isRTL ? "rtl" : "ltr"}
      >
        <p
          className={cn("text-sm font-semibold leading-5", isRTL ? "text-right" : "text-left")}
          dir={isRTL ? "rtl" : "ltr"}
        >
          {lessonTitle}
        </p>
        <div
          className={cn("mt-1 flex items-center gap-2 text-xs text-muted-foreground", isRTL ? "justify-end" : "justify-start")}
          dir={isRTL ? "rtl" : "ltr"}
        >
          <span
            className={cn("inline-flex items-center gap-1", isRTL && "flex-row-reverse")}
            dir={isRTL ? "rtl" : "ltr"}
          >
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            <span className={isRTL ? "text-right" : "text-left"}>{formatDuration(duration, t)}</span>
          </span>
          <span
            className={cn("inline-flex items-center gap-1", isRTL && "flex-row-reverse")}
            dir={isRTL ? "rtl" : "ltr"}
          >
            <PlayCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span className={isRTL ? "text-right" : "text-left"}>{t("lessonOf")} {index + 1}</span>
          </span>
        </div>
      </div>
    </button>
  );
});

LessonPlaylistItem.displayName = "LessonPlaylistItem";

