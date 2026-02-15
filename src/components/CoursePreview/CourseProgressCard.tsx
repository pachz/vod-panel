import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { Doc } from "../../../convex/_generated/dataModel";

type LessonDoc = Doc<"lessons">;

type CourseProgress = {
  completedLessonIds: string[];
  completedCount: number;
  lastCompletedAt: number | null;
};

type CourseProgressCardProps = {
  courseName: string;
  activeLesson: LessonDoc | null;
  lessonPosition: number;
  totalLessons: number;
  progressData: CourseProgress;
  completionPercent: number;
  language: string;
  isRTL: boolean;
  t: (key: string) => string;
};

export const CourseProgressCard = ({
  courseName,
  activeLesson,
  lessonPosition,
  totalLessons,
  progressData,
  completionPercent,
  language,
  isRTL,
  t,
}: CourseProgressCardProps) => {
  return (
    <div className="rounded-3xl border border-border/40 dark:border-transparent bg-card/80 p-6 shadow-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className={cn("min-w-0 flex-1", isRTL ? "text-right" : "text-left")}>
          <p className="text-sm font-semibold text-primary">{t("courseProgress")}</p>
          <h1 className={cn("text-3xl font-bold tracking-tight", isRTL ? "text-right" : "text-left")}>{courseName}</h1>
          <p className={cn("text-muted-foreground mt-1 line-clamp-2", isRTL ? "text-right" : "text-left")}>
            {activeLesson
              ? `${t("lessonOf")} ${lessonPosition} ${t("of")} ${totalLessons}: ${language === "ar" ? activeLesson.title_ar : activeLesson.title}`
              : t("publishLessonsToStart")}
          </p>
        </div>
        <Badge variant="secondary" className="text-primary flex-shrink-0">
          {completionPercent}% {t("complete")}
        </Badge>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {progressData.completedCount} {t("of")} {totalLessons || 0} {t("lessonsCompleted")}
          </span>
          <span>{completionPercent}%</span>
        </div>
        <Progress value={completionPercent} dir={isRTL ? "rtl" : "ltr"} className="h-3 rounded-xl bg-muted" />
      </div>
    </div>
  );
};

