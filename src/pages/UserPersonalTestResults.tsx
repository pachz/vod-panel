import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
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
  const testsPath = localizedPath("/my-tests");

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

  return (
    <div className="mx-auto max-w-3xl space-y-6" dir={isRTL ? "rtl" : "ltr"}>
      <div className="space-y-2">
        <Button variant="ghost" size="sm" className={cn(isRTL ? "-mr-2" : "-ml-2")} asChild>
          <Link to={localizedPath("/my-tests?tab=results")}>
            <ArrowLeft className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
            {t("backToPersonalTests")}
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("myResultsTab")}</h1>
          <p className="text-sm text-muted-foreground">{testTitle}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-3">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            {t("completedOn")} {formatCompletedAt(results.completedAt, language)}
          </span>
          <span>·</span>
          <span>{formatSubmissionDuration(results.durationSeconds)}</span>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-medium">{t("yourAnswers")}</h2>
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

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">{t("recommendedCourses")}</h2>
          <Badge variant="secondary">{results.recommendedCourses.length}</Badge>
        </div>
        {results.recommendedCourses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noCourseRecommendations")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {results.recommendedCourses.map((course) => (
              <li key={course.courseId} className="flex gap-3 rounded-lg border p-3">
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
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
                <div className="min-w-0">
                  <p className="font-medium leading-snug">
                    {language === "ar" ? course.name_ar : course.name}
                  </p>
                  <Button variant="link" className="h-auto p-0 text-sm" asChild>
                    <Link to={localizedPath(`/courses/preview/${course.courseId}`)}>
                      {t("viewCourse")}
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default UserPersonalTestResults;
