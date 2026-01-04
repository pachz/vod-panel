import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { renderMarkdown } from "./MarkdownRenderer";
import type { Doc } from "../../../convex/_generated/dataModel";

type CourseDoc = Doc<"courses">;

type AboutCourseCardProps = {
  course: CourseDoc;
  courseShortDescription: string;
  isRTL: boolean;
  t: (key: string) => string;
  formatDuration: (minutes: number | undefined | null, t: (key: string) => string) => string;
};

export const AboutCourseCard = ({
  course,
  courseShortDescription,
  isRTL,
  t,
  formatDuration,
}: AboutCourseCardProps) => {
  return (
    <Card className="border border-border/60 dark:border-transparent bg-card/70 shadow-sm">
      <CardHeader>
        <CardTitle className={cn("text-lg font-semibold", isRTL ? "text-right" : "text-left")}>
          {t("aboutThisCourse")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        {renderMarkdown(courseShortDescription, isRTL)}
        <div className="flex flex-wrap gap-4 text-xs uppercase tracking-wide text-muted-foreground/80">
          <span>
            {t("lessons")}: <span className="font-semibold text-foreground">{course.lesson_count}</span>
          </span>
          <span>
            {t("duration")}:{" "}
            <span className="font-semibold text-foreground">
              {formatDuration(course.duration, t)}
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

