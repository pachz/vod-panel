import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Doc } from "../../../convex/_generated/dataModel";

type LessonDoc = Doc<"lessons">;

type LessonNavigationButtonsProps = {
  previousLesson: LessonDoc | null;
  nextLesson: LessonDoc | null;
  isActiveLessonCompleted: boolean;
  isTogglingCompletion: boolean;
  activeLesson: LessonDoc | null;
  onPrevious: () => void;
  onNext: () => void;
  onToggleCompletion: () => void;
  isRTL: boolean;
  t: (key: string) => string;
};

export const LessonNavigationButtons = ({
  previousLesson,
  nextLesson,
  isActiveLessonCompleted,
  isTogglingCompletion,
  activeLesson,
  onPrevious,
  onNext,
  onToggleCompletion,
  isRTL,
  t,
}: LessonNavigationButtonsProps) => {
  return (
    <div className="grid gap-4 rounded-3xl border border-border/60 dark:border-transparent bg-background/60 p-4 shadow-sm md:grid-cols-3">
      {isRTL ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center gap-2"
            onClick={onNext}
            disabled={!nextLesson}
          >
            {t("nextLesson")}
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={isActiveLessonCompleted ? "secondary" : "cta"}
            className="w-full gap-2"
            disabled={!activeLesson || isTogglingCompletion}
            onClick={onToggleCompletion}
          >
            {isTogglingCompletion ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {isActiveLessonCompleted ? t("completed") : t("markComplete")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center gap-2"
            onClick={onPrevious}
            disabled={!previousLesson}
          >
            <ChevronRight className="h-4 w-4" />
            {t("previousLesson")}
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center gap-2"
            onClick={onPrevious}
            disabled={!previousLesson}
          >
            <ChevronLeft className="h-4 w-4" />
            {t("previousLesson")}
          </Button>
          <Button
            type="button"
            variant={isActiveLessonCompleted ? "secondary" : "cta"}
            className="w-full gap-2"
            disabled={!activeLesson || isTogglingCompletion}
            onClick={onToggleCompletion}
          >
            {isTogglingCompletion ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {isActiveLessonCompleted ? t("completed") : t("markComplete")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center gap-2"
            onClick={onNext}
            disabled={!nextLesson}
          >
            {t("nextLesson")}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
};

