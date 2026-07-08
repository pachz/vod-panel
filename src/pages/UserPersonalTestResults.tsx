import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { cn, markdownToPlainText } from "@/lib/utils";
import { formatSubmissionDuration } from "../../shared/validation/personalTestAnalytics";

function formatCompletedAt(timestamp: number, language: "en" | "ar") {
  return new Intl.DateTimeFormat(language === "ar" ? "ar" : undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

const UserPersonalTestResults = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { language, t, isRTL, localizedPath } = useLanguage();
  const testsPath = localizedPath("/my-tests?tab=results");

  const results = useQuery(api.personalTestAttempts.getMyPersonalTestAttemptResults, {
    attemptId: attemptId as Id<"personalTestAttempts">,
  });

  if (results === undefined) {
    return (
      <p className="text-muted-foreground" dir={isRTL ? "rtl" : "ltr"}>
        {t("loading")}
      </p>
    );
  }

  if (results === null) {
    return (
      <div className="mx-auto max-w-3xl space-y-4" dir={isRTL ? "rtl" : "ltr"}>
        <Button variant="ghost" size="sm" className={cn(isRTL ? "-mr-2" : "-ml-2")} asChild>
          <Link to={testsPath}>
            <ArrowLeft className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
            {t("backToPersonalTests")}
          </Link>
        </Button>
        <p>{t("personalTestNotAvailable")}</p>
      </div>
    );
  }

  const testTitle = language === "ar" ? results.testNameAr : results.testName;

  const getCourseDescription = (course: (typeof results.recommendedCourses)[number]) => {
    const raw =
      language === "ar"
        ? course.short_description_ar ?? course.short_description
        : course.short_description ?? course.short_description_ar;
    if (!raw) return undefined;
    return markdownToPlainText(raw);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6" dir={isRTL ? "rtl" : "ltr"}>
      <div className="space-y-2">
        <Button variant="ghost" size="sm" className={cn(isRTL ? "-mr-2" : "-ml-2")} asChild>
          <Link to={testsPath}>
            <ArrowLeft className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
            {t("backToPersonalTests")}
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{testTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("completedOn")} {formatCompletedAt(results.completedAt, language)}
            {" · "}
            {formatSubmissionDuration(results.durationSeconds)}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t("topRecommendedCourses")}</h2>
        {results.recommendedCourses.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">{t("noCourseRecommendations")}</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {results.recommendedCourses.map((course) => {
              const courseName = language === "ar" ? course.name_ar : course.name;
              const description = getCourseDescription(course);

              return (
                <li
                  key={course.courseId}
                  className={cn(
                    "flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center",
                    isRTL && "sm:flex-row-reverse",
                  )}
                >
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-24 sm:w-24">
                    {course.thumbnail_image_url ? (
                      <img
                        src={course.thumbnail_image_url}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        {t("noImage")}
                      </div>
                    )}
                  </div>
                  <div
                    className={cn(
                      "min-w-0 flex-1 space-y-1",
                      isRTL ? "text-right" : "text-left",
                    )}
                  >
                    <p className="font-semibold leading-snug">{courseName}</p>
                    {description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {description}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    className="shrink-0 border-cta text-cta hover:bg-cta/5 hover:text-cta"
                    asChild
                  >
                    <a
                      href={localizedPath(`/courses/preview/${course.courseId}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("viewCourse")}
                    </a>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4 shadow-sm">
        <h2 className="font-semibold">{t("yourAnswers")}</h2>
        {results.responses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noAnswerSelected")}</p>
        ) : (
          <ol className="space-y-4">
            {results.responses.map((response, index) => {
              const questionTitle =
                language === "ar" ? response.questionTitleAr : response.questionTitle;
              const selectedLabel =
                response.answerType === "multi"
                  ? t("selectedAnswers")
                  : t("selectedAnswer");

              return (
                <li key={response.questionId} className="rounded-lg border p-4 space-y-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t("questionProgress")
                        .replace("{current}", String(index + 1))
                        .replace("{total}", String(results.responses.length))}
                    </p>
                    <p className="font-medium">{questionTitle}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {selectedLabel}
                    </p>
                    {response.selectedAnswers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("noAnswerSelected")}</p>
                    ) : (
                      <ul className="space-y-2">
                        {response.selectedAnswers.map((answer) => (
                          <li
                            key={answer.answerId}
                            className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
                          >
                            {language === "ar" ? answer.text_ar : answer.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
};

export default UserPersonalTestResults;
