import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardList, ChevronLeft, ChevronRight, HelpCircle, Search } from "lucide-react";
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

const RESULTS_PAGE_SIZE = 10;

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
  const resultsSearchFilter = searchParams.get("resultsSearch") || undefined;
  const activeTab = searchParams.get("tab") === "results" ? "results" : "available";
  const { language, t, isRTL, localizedPath } = useLanguage();

  const [searchInput, setSearchInput] = useState(searchFilter || "");
  const [resultsSearchInput, setResultsSearchInput] = useState(resultsSearchFilter || "");
  const [resultsCursor, setResultsCursor] = useState<string | undefined>(undefined);
  const [resultsPrevCursors, setResultsPrevCursors] = useState<string[]>([]);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tests = useQuery(api.personalTest.listPublishedPersonalTests, {
    search: searchFilter,
  });
  const completedAttemptsPage = useQuery(
    api.personalTestAttempts.listMyCompletedPersonalTestAttempts,
    {
      search: resultsSearchFilter,
      limit: RESULTS_PAGE_SIZE,
      cursor: resultsCursor,
    },
  );
  const completedAttempts = completedAttemptsPage?.page;

  useEffect(() => {
    setSearchInput(searchFilter || "");
  }, [searchFilter]);

  useEffect(() => {
    setResultsSearchInput(resultsSearchFilter || "");
  }, [resultsSearchFilter]);

  useEffect(() => {
    setResultsCursor(undefined);
    setResultsPrevCursors([]);
  }, [resultsSearchFilter]);

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

  useEffect(() => {
    if (resultsSearchTimeoutRef.current) {
      clearTimeout(resultsSearchTimeoutRef.current);
    }

    resultsSearchTimeoutRef.current = setTimeout(() => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        const value = resultsSearchInput.trim();
        if (value) {
          newParams.set("resultsSearch", value);
        } else {
          newParams.delete("resultsSearch");
        }
        return newParams;
      }, { replace: true });
    }, 300);

    return () => {
      if (resultsSearchTimeoutRef.current) {
        clearTimeout(resultsSearchTimeoutRef.current);
      }
    };
  }, [resultsSearchInput, setSearchParams]);

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

  const handleResultsNextPage = () => {
    if (!completedAttemptsPage?.continueCursor) return;
    setResultsPrevCursors((prev) => [...prev, resultsCursor ?? ""]);
    setResultsCursor(completedAttemptsPage.continueCursor);
  };

  const handleResultsPrevPage = () => {
    if (resultsPrevCursors.length === 0) return;
    const nextPrev = resultsPrevCursors.slice(0, -1);
    const prevCursor = resultsPrevCursors[resultsPrevCursors.length - 1];
    setResultsPrevCursors(nextPrev);
    setResultsCursor(prevCursor === "" ? undefined : prevCursor);
  };

  const isLoadingTests = tests === undefined;
  const isLoadingResults = completedAttemptsPage === undefined;
  const showResultsPagination =
    !isLoadingResults &&
    completedAttempts &&
    completedAttempts.length > 0 &&
    (resultsPrevCursors.length > 0 || (completedAttemptsPage && !completedAttemptsPage.isDone));

  return (
    <div className="mx-auto max-w-6xl space-y-8" dir={isRTL ? "rtl" : "ltr"}>
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t("personalTestsPageTitle")}
        </h1>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          {t("personalTestsPageSubtitle")}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList
          className={cn(
            "mx-auto grid w-full max-w-md grid-cols-2",
            isRTL && "flex-row-reverse",
          )}
        >
          <TabsTrigger value="available">{t("availableTestsTab")}</TabsTrigger>
          <TabsTrigger value="results">{t("myResultsTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="mt-8 space-y-6">
          <div className="relative mx-auto max-w-md">
            <Search
              className={cn(
                "absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
                isRTL ? "right-3" : "left-3",
              )}
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("searchPersonalTests")}
              className={cn(isRTL ? "pr-9" : "pl-9")}
            />
          </div>

          {isLoadingTests ? (
            <p className="text-center text-muted-foreground">{t("loading")}</p>
          ) : sortedTests.length === 0 ? (
            <div className="rounded-2xl border bg-card p-10 text-center space-y-3">
              <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">{t("noPersonalTestsAvailable")}</p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {sortedTests.map((test) => {
                const title = language === "ar" ? test.name_ar : test.name;
                const description =
                  language === "ar" ? test.description_ar : test.description;

                return (
                  <Card
                    key={test._id}
                    className="flex flex-col overflow-hidden shadow-md"
                  >
                    <div className="relative h-48 w-full overflow-hidden bg-muted">
                      {test.thumbnail_image_url ? (
                        <img
                          src={test.thumbnail_image_url}
                          alt={title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-muted text-muted-foreground">
                          <ClipboardList className="h-10 w-10 opacity-40" />
                        </div>
                      )}
                    </div>
                    <CardHeader className="space-y-2 pb-2">
                      <CardTitle className="text-lg font-bold leading-snug">
                        {title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4 pb-4">
                      {description && (
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-muted-foreground/30">
                          <HelpCircle className="h-3.5 w-3.5" />
                        </span>
                        <span>
                          {test.questionCount}{" "}
                          {test.questionCount === 1 ? t("question") : t("questions")}
                        </span>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0">
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

        <TabsContent value="results" className="mt-8 space-y-6">
          <div className="relative mx-auto max-w-md">
            <Search
              className={cn(
                "absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
                isRTL ? "right-3" : "left-3",
              )}
            />
            <Input
              value={resultsSearchInput}
              onChange={(e) => setResultsSearchInput(e.target.value)}
              placeholder={t("searchMyResults")}
              className={cn(isRTL ? "pr-9" : "pl-9")}
            />
          </div>

          {isLoadingResults ? (
            <p className="text-center text-muted-foreground">{t("loading")}</p>
          ) : !completedAttempts || completedAttempts.length === 0 ? (
            <div className="rounded-2xl border bg-card p-10 text-center space-y-3">
              <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">
                {resultsSearchFilter ? t("noCompletedTestsMatch") : t("noCompletedTests")}
              </p>
            </div>
          ) : (
            <>
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
                          <p className="text-sm text-muted-foreground">
                            {attempt.recommendedCourseCount}{" "}
                            {attempt.recommendedCourseCount === 1
                              ? t("recommendedCourseSingular")
                              : t("recommendedCoursesCount")}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {showResultsPagination && (
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResultsPrevPage}
                    disabled={resultsPrevCursors.length === 0}
                  >
                    <ChevronLeft className={cn("h-4 w-4", isRTL ? "ml-1 rotate-180" : "mr-1")} />
                    {t("previousPage")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResultsNextPage}
                    disabled={!completedAttemptsPage?.continueCursor}
                  >
                    {t("nextPage")}
                    <ChevronRight className={cn("h-4 w-4", isRTL ? "mr-1 rotate-180" : "ml-1")} />
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UserPersonalTests;
