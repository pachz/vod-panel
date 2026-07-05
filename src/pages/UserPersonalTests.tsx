import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardList, Search } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { formatSubmissionDuration } from "../../shared/validation/personalTestAnalytics";

function formatCompletedAt(timestamp: number, language: "en" | "ar") {
  return new Intl.DateTimeFormat(language === "ar" ? "ar" : undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

const UserPersonalTests = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchFilter = searchParams.get("search") || undefined;
  const activeTab = searchParams.get("tab") === "results" ? "results" : "available";
  const { language, t, isRTL, localizedPath } = useLanguage();

  const [searchInput, setSearchInput] = useState(searchFilter || "");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tests = useQuery(api.personalTest.listPublishedPersonalTests, {
    search: searchFilter,
  });
  const completedAttempts = useQuery(
    api.personalTestAttempts.listMyCompletedPersonalTestAttempts,
    {},
  );

  useEffect(() => {
    setSearchInput(searchFilter || "");
  }, [searchFilter]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        const value = searchInput.trim();
        if (value) {
          newParams.set("search", value);
        } else {
          newParams.delete("search");
        }
        return newParams;
      }, { replace: true });
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchInput, setSearchParams]);

  const sortedTests = useMemo(() => {
    if (!tests) return [];
    return [...tests].sort((a, b) => a.name.localeCompare(b.name));
  }, [tests]);

  const handleOpenTest = (testId: Id<"personalTests">) => {
    navigate(localizedPath(`/my-tests/${testId}`));
  };

  const handleTabChange = (value: string) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      if (value === "results") {
        newParams.set("tab", "results");
      } else {
        newParams.delete("tab");
      }
      return newParams;
    }, { replace: true });
  };

  const isLoadingTests = tests === undefined;
  const isLoadingResults = completedAttempts === undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-6" dir={isRTL ? "rtl" : "ltr"}>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("personalTests")}
        </h1>
        <p className="text-muted-foreground">{t("personalTestsSubtitle")}</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className={cn("grid w-full max-w-md grid-cols-2", isRTL && "flex-row-reverse")}>
          <TabsTrigger value="available">{t("availableTestsTab")}</TabsTrigger>
          <TabsTrigger value="results">
            {t("myResultsTab")}
            {completedAttempts && completedAttempts.length > 0 && (
              <span className="ms-2 text-xs text-muted-foreground">
                ({completedAttempts.length})
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="mt-6 space-y-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("searchPersonalTests")}
              className="pl-9"
            />
          </div>

          {isLoadingTests ? (
            <p className="text-muted-foreground">{t("loading")}</p>
          ) : sortedTests.length === 0 ? (
            <div className="rounded-2xl border bg-card p-10 text-center space-y-3">
              <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">{t("noPersonalTestsAvailable")}</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedTests.map((test) => {
                const title = language === "ar" ? test.name_ar : test.name;
                const description =
                  language === "ar" ? test.description_ar : test.description;

                return (
                  <Card key={test._id} className="flex flex-col">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-lg leading-snug">{title}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-3">
                      {description && (
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {description}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {test.questionCount}{" "}
                        {test.questionCount === 1 ? t("question") : t("questions")}
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button
                        variant="cta"
                        className="w-full"
                        onClick={() => handleOpenTest(test._id)}
                      >
                        {t("startPersonalTest")}
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="results" className="mt-6">
          {isLoadingResults ? (
            <p className="text-muted-foreground">{t("loading")}</p>
          ) : completedAttempts.length === 0 ? (
            <div className="rounded-2xl border bg-card p-10 text-center space-y-3">
              <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">{t("noCompletedTests")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {completedAttempts.map((attempt) => {
                const title =
                  language === "ar" ? attempt.testNameAr : attempt.testName;

                return (
                  <Card key={attempt.attemptId}>
                    <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">{title}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {t("completedOn")}{" "}
                          {formatCompletedAt(attempt.completedAt, language)}
                          {" · "}
                          {formatSubmissionDuration(attempt.durationSeconds)}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to={localizedPath(`/my-tests/results/${attempt.attemptId}`)}
                        >
                          {t("viewResults")}
                        </Link>
                      </Button>
                    </CardHeader>
                    <CardContent>
                      {attempt.recommendedCourses.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t("noCourseRecommendations")}
                        </p>
                      ) : (
                        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {attempt.recommendedCourses.map((course) => (
                            <li
                              key={course.courseId}
                              className="flex gap-3 rounded-lg border p-3"
                            >
                              <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                                {course.thumbnail_image_url ? (
                                  <img
                                    src={course.thumbnail_image_url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                    {t("noImage")}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium leading-snug line-clamp-2">
                                  {language === "ar" ? course.name_ar : course.name}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UserPersonalTests;
