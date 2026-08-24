import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PersonalTestRunner } from "@/components/PersonalTests/PersonalTestRunner";
import { isResultColor } from "@/components/PersonalTests/resultColor";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

const UserPersonalTestTake = () => {
  const { id } = useParams<{ id: string }>();
  const testId = id as Id<"personalTests">;
  const { language, t, isRTL, localizedPath } = useLanguage();
  const [hasStarted, setHasStarted] = useState(false);
  const testsPath = localizedPath("/my-tests");

  const data = useQuery(api.personalTest.getPublishedPersonalTest, { testId });

  if (data === undefined) {
    return (
      <p className="text-muted-foreground" dir={isRTL ? "rtl" : "ltr"}>
        {t("loading")}
      </p>
    );
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-2xl space-y-4" dir={isRTL ? "rtl" : "ltr"}>
        <p>{t("personalTestNotAvailable")}</p>
        <Button variant="outline" asChild>
          <Link to={testsPath}>{t("backToPersonalTests")}</Link>
        </Button>
      </div>
    );
  }

  const { test, questions } = data;
  const title = language === "ar" ? test.name_ar : test.name;
  const description = language === "ar" ? test.description_ar : test.description;
  const startButtonLabel =
    language === "ar"
      ? test.start_button_text_ar || t("startPersonalTest")
      : test.start_button_text || t("startPersonalTest");
  const startButtonColor = isResultColor(test.start_button_color)
    ? test.start_button_color
    : undefined;

  if (!hasStarted) {
    return (
      <div className="mx-auto max-w-2xl space-y-6" dir={isRTL ? "rtl" : "ltr"}>
        <Button variant="ghost" size="sm" asChild>
          <Link to={testsPath}>
            {isRTL ? (
              <ArrowRight className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
            ) : (
              <ArrowLeft className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
            )}
            {t("backToPersonalTests")}
          </Link>
        </Button>

        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          {test.cover_image_url ? (
            <div className="aspect-video overflow-hidden bg-muted">
              <img
                src={test.cover_image_url}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}

          <div className="space-y-6 p-8 text-center sm:text-start">
            <div className="space-y-4">
              <h1 className="text-2xl font-semibold">{title}</h1>
              {description ? (
                <div className="space-y-2 text-start">
                  <p className="text-sm font-medium">{t("testDescription")}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{description}</p>
                </div>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {test.questionCount}{" "}
                {test.questionCount === 1 ? t("question") : t("questions")}
              </p>
            </div>

            <div className="flex flex-col justify-center gap-3 sm:flex-row sm:justify-start">
              <Button
                variant={startButtonColor ? "default" : "cta"}
                onClick={() => setHasStarted(true)}
                style={
                  startButtonColor
                    ? {
                        backgroundColor: startButtonColor,
                        borderColor: startButtonColor,
                        color: "#fff",
                      }
                    : undefined
                }
              >
                {startButtonLabel}
              </Button>
              <Button variant="outline" asChild>
                <Link to={testsPath}>{t("backToPersonalTests")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PersonalTestRunner
      testId={testId}
      testName={test.name}
      testNameAr={test.name_ar}
      questions={questions}
      isPreview={false}
      active={hasStarted}
      language={language}
      isRTL={isRTL}
      backHref={testsPath}
      backLabel={t("backToPersonalTests")}
      testCompletedTitle={t("testCompletedTitle")}
      testCompletedSubtitle={t("testCompletedSubtitle")}
      topRecommendedLabel={t("topRecommendedCourses")}
      viewCourseLabel={t("viewCourse")}
      getCourseHref={(courseId) => localizedPath(`/courses/preview/${courseId}`)}
      chooseOneLabel={t("chooseOneAnswer")}
      chooseAllLabel={t("chooseAllAnswers")}
      previousLabel={t("previous")}
      nextLabel={t("next")}
      seeResultsLabel={t("seeResults")}
      savingResultsLabel={t("savingResults")}
      noRecommendationsLabel={t("noCourseRecommendations")}
      questionProgressLabel={(current, total) =>
        t("questionProgress")
          .replace("{current}", String(current))
          .replace("{total}", String(total))
      }
      percentCompleteLabel={(percent) =>
        t("testProgressComplete").replace("{percent}", String(percent))
      }
      completedInLabel={(duration) =>
        t("completedIn").replace("{duration}", duration)
      }
      restartLabel={t("retakeTest")}
      secondaryAction={{
        href: localizedPath("/courses/card"),
        label: t("exploreAllCourses"),
      }}
    />
  );
};

export default UserPersonalTestTake;
