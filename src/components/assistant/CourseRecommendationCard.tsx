import { Clock, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { pathForLanguage, translate, useLanguage, type Language } from "@/hooks/use-language";
import { trackPosthogEvent } from "@/lib/posthog";
import { cn } from "@/lib/utils";
import { formatCourseDescriptionPreview } from "./formatAssistantText";
import type { CourseSearchResult } from "./types";

type CourseRecommendationCardProps = {
  course: CourseSearchResult;
  contentLanguage?: Language;
};

export function CourseRecommendationCard({
  course,
  contentLanguage,
}: CourseRecommendationCardProps) {
  const { language } = useLanguage();
  const displayLanguage = contentLanguage ?? language;
  const isRtl = displayLanguage === "ar";
  const courseUrl = pathForLanguage(`/courses/preview/${course.id}`, displayLanguage);

  const title =
    displayLanguage === "ar"
      ? course.titleAr || course.title || course.titleEn
      : course.titleEn || course.title || course.titleAr;
  const description =
    displayLanguage === "ar"
      ? course.descriptionAr || course.description || course.descriptionEn
      : course.descriptionEn || course.description || course.descriptionAr;
  const category =
    displayLanguage === "ar"
      ? course.categoryAr || course.category || course.categoryEn
      : course.categoryEn || course.category || course.categoryAr;

  const preferredTitle = displayLanguage === "ar" ? course.titleAr : course.titleEn;
  const hasBilingualFields =
    course.titleEn !== undefined || course.titleAr !== undefined;
  const usedFallbackTranslation = hasBilingualFields
    ? !preferredTitle?.trim() && Boolean(title?.trim())
    : course.usedFallbackTranslation;

  const accessLabel =
    course.accessStatus === "included"
      ? translate(displayLanguage, "assistantAccessIncluded")
      : course.accessStatus === "locked"
        ? translate(displayLanguage, "assistantAccessLocked")
        : translate(displayLanguage, "assistantAccessUnknown");

  const descriptionPreview = formatCourseDescriptionPreview(description);

  return (
    <Card
      className={cn(
        "overflow-hidden border-border/60 bg-card/80",
        isRtl && "assistant-rtl text-right",
      )}
      dir={isRtl ? "rtl" : "ltr"}
      lang={displayLanguage}
    >
      {course.imageUrl ? (
        <div className="aspect-video w-full overflow-hidden bg-muted">
          <img
            src={course.imageUrl}
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      ) : null}
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {category ? <Badge variant="secondary">{category}</Badge> : null}
          <Badge variant="outline">{accessLabel}</Badge>
        </div>
        <CardTitle className={cn("text-lg leading-snug", isRtl && "text-right")}>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {descriptionPreview ? (
          <p className={cn("line-clamp-3 text-sm text-muted-foreground", isRtl && "text-right")}>
            {descriptionPreview}
          </p>
        ) : null}
        {course.durationMinutes ? (
          <p
            className={cn(
              "flex items-center gap-2 text-sm text-muted-foreground",
              isRtl && "text-right",
            )}
          >
            <Clock className="h-4 w-4" />
            {course.durationMinutes} {translate(displayLanguage, "assistantMinutes")}
          </p>
        ) : null}
        {usedFallbackTranslation ? (
          <p className={cn("text-xs text-muted-foreground", isRtl && "text-right")}>
            {translate(displayLanguage, "assistantTranslationFallback")}
          </p>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button asChild variant="cta" className="w-full sm:w-auto">
          <Link
            to={courseUrl}
            onClick={() => {
              trackPosthogEvent("assistant_course_clicked", { courseId: course.id });
            }}
          >
            <ExternalLink className="h-4 w-4 me-2" />
            {translate(displayLanguage, "viewCourse")}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
