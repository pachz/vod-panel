import { Clock, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/hooks/use-language";
import { trackPosthogEvent } from "@/lib/posthog";
import { formatCourseDescriptionPreview } from "./formatAssistantText";
import type { CourseSearchResult } from "./types";

type CourseRecommendationCardProps = {
  course: CourseSearchResult;
};

export function CourseRecommendationCard({ course }: CourseRecommendationCardProps) {
  const { t, localizedPath } = useLanguage();
  const courseUrl = localizedPath(`/courses/preview/${course.id}`);

  const accessLabel =
    course.accessStatus === "included"
      ? t("assistantAccessIncluded")
      : course.accessStatus === "locked"
        ? t("assistantAccessLocked")
        : t("assistantAccessUnknown");

  const descriptionPreview = formatCourseDescriptionPreview(course.description);

  return (
    <Card className="overflow-hidden border-border/60 bg-card/80">
      {course.imageUrl ? (
        <div className="aspect-video w-full overflow-hidden bg-muted">
          <img
            src={course.imageUrl}
            alt={course.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      ) : null}
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {course.category ? <Badge variant="secondary">{course.category}</Badge> : null}
          <Badge variant="outline">{accessLabel}</Badge>
        </div>
        <CardTitle className="text-lg leading-snug">{course.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {descriptionPreview ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">{descriptionPreview}</p>
        ) : null}
        {course.durationMinutes ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {course.durationMinutes} {t("assistantMinutes")}
          </p>
        ) : null}
        {course.usedFallbackTranslation ? (
          <p className="text-xs text-muted-foreground">{t("assistantTranslationFallback")}</p>
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
            {t("viewCourse")}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
