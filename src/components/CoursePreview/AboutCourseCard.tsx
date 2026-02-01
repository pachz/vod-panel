import { FileText, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { renderMarkdown } from "./MarkdownRenderer";
import type { Doc } from "../../../convex/_generated/dataModel";

type CourseDoc = Doc<"courses">;

type AboutCourseCardProps = {
  course: CourseDoc;
  courseShortDescription: string;
  isRTL: boolean;
  t: (key: string) => string;
  formatDuration: (seconds: number | undefined | null) => string;
  pdfMaterialUrl?: string | null;
  pdfMaterialName?: string | null;
};

export const AboutCourseCard = ({
  course,
  courseShortDescription,
  isRTL,
  t,
  formatDuration,
  pdfMaterialUrl,
  pdfMaterialName,
}: AboutCourseCardProps) => {
  const hasPdfMaterial = !!pdfMaterialUrl && !!pdfMaterialName;

  return (
    <Card className="min-w-0 border border-border/60 dark:border-transparent bg-card/70 shadow-sm">
      <CardHeader>
        <CardTitle className={cn("text-lg font-semibold", isRTL ? "text-right" : "text-left")}>
          {t("aboutThisCourse")}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 overflow-hidden space-y-4 text-sm text-muted-foreground">
        {renderMarkdown(courseShortDescription, isRTL)}
        <div className="flex flex-wrap gap-4 text-xs uppercase tracking-wide text-muted-foreground/80">
          <span>
            {t("lessons")}: <span className="font-semibold text-foreground">{course.lesson_count}</span>
          </span>
          <span>
            {t("duration")}:{" "}
            <span className="font-semibold text-foreground">
              {formatDuration(course.duration)}
            </span>
          </span>
        </div>
        {hasPdfMaterial && (
          <div
            className={cn(
              "min-w-0 overflow-hidden rounded-lg border border-border/60 bg-muted/30 p-3",
              isRTL ? "text-right" : "text-left",
            )}
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("courseMaterial")}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full min-w-0 gap-2 font-medium"
              asChild
            >
              <a
                href={pdfMaterialUrl}
                download={pdfMaterialName}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-2 overflow-hidden"
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate" title={pdfMaterialName ?? undefined}>
                  {pdfMaterialName}
                </span>
                <Download className="h-4 w-4 shrink-0" />
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

