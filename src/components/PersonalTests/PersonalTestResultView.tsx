import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn, markdownToPlainText } from "@/lib/utils";
import { isResultColor } from "./resultColor";

export type PersonalTestResultContent = {
  title: string;
  title_ar: string;
  description?: string;
  description_ar?: string;
  cover_image_url?: string;
  color?: string;
  ctaText?: string;
  ctaText_ar?: string;
  ctaUrl?: string;
};

export type PersonalTestResultCourse = {
  _id: Id<"courses">;
  name: string;
  name_ar: string;
  thumbnail_image_url?: string;
  imageUrl?: string;
  short_description?: string;
  short_description_ar?: string;
};

type PersonalTestResultViewProps = {
  result: PersonalTestResultContent;
  courses: PersonalTestResultCourse[];
  isArabic: boolean;
  recommendedCoursesLabel: string;
  viewCourseLabel?: string;
  getCourseHref?: (courseId: Id<"courses">) => string;
  className?: string;
};

export function PersonalTestResultView({
  result,
  courses,
  isArabic,
  recommendedCoursesLabel,
  viewCourseLabel,
  getCourseHref,
  className,
}: PersonalTestResultViewProps) {
  const accent = isResultColor(result.color) ? result.color : undefined;
  const title = isArabic ? result.title_ar : result.title;
  const description = isArabic ? result.description_ar : result.description;
  const ctaText = isArabic ? result.ctaText_ar : result.ctaText;
  const hasCta = Boolean(ctaText && result.ctaUrl);

  return (
    <div
      className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", className)}
      dir={isArabic ? "rtl" : "ltr"}
    >
      {result.cover_image_url ? (
        <div className="aspect-video overflow-hidden bg-muted">
          <img
            src={result.cover_image_url}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}

      <div className="space-y-4 p-5">
        <div className="space-y-2">
          <h2
            className="text-xl font-semibold tracking-tight"
            style={accent ? { color: accent } : undefined}
          >
            {title}
          </h2>
          {description ? (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        {hasCta ? (
          <Button
            asChild
            variant={accent ? "default" : "cta"}
            className="w-full"
            style={
              accent
                ? {
                    backgroundColor: accent,
                    borderColor: accent,
                    color: "#fff",
                  }
                : undefined
            }
          >
            <a href={result.ctaUrl} target="_blank" rel="noopener noreferrer">
              {ctaText}
            </a>
          </Button>
        ) : null}

        {courses.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold">{recommendedCoursesLabel}</p>
            <ul className="space-y-2">
              {courses.map((course) => {
                const imageUrl = course.thumbnail_image_url ?? course.imageUrl;
                const courseName = isArabic ? course.name_ar : course.name;
                const rawDescription = isArabic
                  ? course.short_description_ar ?? course.short_description
                  : course.short_description ?? course.short_description_ar;
                const courseDescription = rawDescription
                  ? markdownToPlainText(rawDescription)
                  : undefined;
                const href = getCourseHref?.(course._id);

                return (
                  <li
                    key={course._id}
                    className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                  >
                    <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium leading-snug">{courseName}</p>
                      {courseDescription ? (
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {courseDescription}
                        </p>
                      ) : null}
                    </div>
                    {href && viewCourseLabel ? (
                      <Button
                        variant="outline"
                        className="shrink-0 border-cta text-cta hover:bg-cta/5 hover:text-cta"
                        asChild
                      >
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {viewCourseLabel}
                        </a>
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
