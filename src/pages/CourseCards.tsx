import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";
import { cn, markdownToPlainText } from "@/lib/utils";

type CourseDoc = Doc<"courses">;
type CategoryDoc = Doc<"categories">;
type CoachDoc = Doc<"coaches">;

/** Duration is stored in seconds; format as time (0:10 or 01:10:10). */
const formatDurationTime = (seconds: number | undefined | null) => {
  if (seconds === undefined || seconds === null) {
    return "0:00";
  }
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${m}:${pad(s)}`;
};

const formatLessonCount = (count: number | undefined, t: (key: string) => string) => {
  if (typeof count !== "number" || Number.isNaN(count) || count < 0) {
    return `0 ${t("lessons")}`;
  }
  return `${count} ${count === 1 ? t("lesson") : t("lessons")}`;
};

const PAGE_SIZE = 12;

const CourseCards = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFilter = searchParams.get("category") || undefined;
  const coachFilter = searchParams.get("coach") || undefined;
  const searchFilter = searchParams.get("search") || undefined;
  const { language, t, isRTL } = useLanguage();

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [prevCursors, setPrevCursors] = useState<string[]>([]);

  const courses = useQuery(api.course.listCourses, {
    categoryId: categoryFilter as Id<"categories"> | undefined,
    coachId: coachFilter as Id<"coaches"> | undefined,
    status: "published",
    search: searchFilter,
    limit: PAGE_SIZE,
    cursor: cursor || undefined,
  });

  useEffect(() => {
    setCursor(undefined);
    setPrevCursors([]);
  }, [categoryFilter, coachFilter, searchFilter]);

  const categories = useQuery(api.category.listCategories);
  const categoryIdsWithPublishedCourses = useQuery(
    api.course.getCategoryIdsWithPublishedCourses
  );
  const coaches = useQuery(api.coach.listCoaches);
  const coachIdsWithPublishedCourses = useQuery(
    api.course.getCoachIdsWithPublishedCourses
  );

  const [searchInput, setSearchInput] = useState(searchFilter || "");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const courseList = useMemo<CourseDoc[]>(() => {
    if (!courses) return [];
    // Extract page from paginated result
    return (
      courses.page.sort((a, b) => {
        const orderA = a.displayOrder ?? 50;
        const orderB = b.displayOrder ?? 50;

        if (orderA !== orderB) {
          return orderA - orderB;
        }

        const createdA = a.createdAt ?? 0;
        const createdB = b.createdAt ?? 0;

        if (createdA !== createdB) {
          return createdA - createdB;
        }

        // Final stable tie-breaker
        return a._id.localeCompare(b._id);
      }) ?? []
    );
  }, [courses]);

  const categoryList = useMemo<CategoryDoc[]>(() => categories ?? [], [categories]);

  const filterableCategories = useMemo<CategoryDoc[]>(() => {
    const idsWithCourses = new Set(categoryIdsWithPublishedCourses ?? []);
    return categoryList.filter(
      (category) =>
        idsWithCourses.has(category._id) || category._id === categoryFilter
    );
  }, [categoryList, categoryIdsWithPublishedCourses, categoryFilter]);

  const coachList = useMemo<CoachDoc[]>(() => coaches ?? [], [coaches]);
  const filterableCoaches = useMemo<CoachDoc[]>(() => {
    const idsWithCourses = new Set(coachIdsWithPublishedCourses ?? []);
    return coachList.filter(
      (coach) =>
        idsWithCourses.has(coach._id) || coach._id === coachFilter
    );
  }, [coachList, coachIdsWithPublishedCourses, coachFilter]);

  const isLoading = courses === undefined;

  const categoryNameById = useMemo(() => {
    return categoryList.reduce<Record<string, string>>((acc, category) => {
      acc[category._id] = language === "ar" ? category.name_ar : category.name;
      return acc;
    }, {});
  }, [categoryList, language]);

  const handleCategorySelect = useCallback(
    (categoryId?: string) => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        if (categoryId) {
          newParams.set("category", categoryId);
        } else {
          newParams.delete("category");
        }
        return newParams;
      }, { replace: true });
    },
    [setSearchParams],
  );

  const handleCoachSelect = useCallback(
    (coachId?: string) => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        if (coachId) {
          newParams.set("coach", coachId);
        } else {
          newParams.delete("coach");
        }
        return newParams;
      }, { replace: true });
    },
    [setSearchParams],
  );

  const handleNextPage = useCallback(() => {
    if (!courses?.continueCursor) return;
    setPrevCursors((prev) => [...prev, cursor ?? ""]);
    setCursor(courses.continueCursor);
  }, [courses?.continueCursor, cursor]);

  const handlePrevPage = useCallback(() => {
    if (prevCursors.length === 0) return;
    const nextPrev = prevCursors.slice(0, -1);
    const prevCursor = prevCursors[prevCursors.length - 1];
    setPrevCursors(nextPrev);
    setCursor(prevCursor === "" ? undefined : prevCursor);
  }, [prevCursors]);

  const showPagination =
    !isLoading &&
    courseList.length > 0 &&
    (prevCursors.length > 0 || (courses && !courses.isDone));

  return (
    <div className="space-y-8" dir={isRTL ? "rtl" : "ltr"}>
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t("allCourses")}</h1>
        <p className="text-muted-foreground">
          {t("discoverCourses")}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => handleCategorySelect(undefined)}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
            categoryFilter
              ? "text-muted-foreground hover:text-foreground"
              : "border-primary bg-primary/10 text-primary"
          }`}
        >
          {t("allCategories")}
        </button>
        {filterableCategories.map((category) => {
          const isActive = categoryFilter === category._id;
          const categoryName = language === "ar" ? category.name_ar : category.name;
          return (
            <button
              type="button"
              key={category._id}
              onClick={() => handleCategorySelect(isActive ? undefined : category._id)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {categoryName}
            </button>
          );
        })}
      </div>

      <div
        className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-center gap-2"
        dir={isRTL ? "rtl" : "ltr"}
      >
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t("searchCourse")}
          className="min-w-[200px] flex-1 text-center sm:max-w-md"
        />
        {filterableCoaches.length > 0 && (
          <Select
            value={coachFilter ?? "all"}
            onValueChange={(value) =>
              handleCoachSelect(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger
              className={cn(
                "w-[180px] shrink-0",
                isRTL && "text-right [&>span]:text-right"
              )}
              dir={isRTL ? "rtl" : undefined}
            >
              <SelectValue placeholder={t("allCoaches")} />
            </SelectTrigger>
            <SelectContent className={isRTL ? "text-right" : undefined} dir={isRTL ? "rtl" : undefined}>
              <SelectItem
                value="all"
                className={isRTL ? "pl-2 pr-8 [&>span:first-child]:left-auto [&>span:first-child]:right-2 text-right" : undefined}
              >
                {t("allCoaches")}
              </SelectItem>
              {filterableCoaches.map((coach) => {
                const coachName =
                  language === "ar" ? coach.name_ar : coach.name;
                return (
                  <SelectItem
                    key={coach._id}
                    value={coach._id}
                    className={isRTL ? "pl-2 pr-8 [&>span:first-child]:left-auto [&>span:first-child]:right-2 text-right" : undefined}
                  >
                    {coachName}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {t("loadingCourses")}
        </div>
      ) : courseList.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {categoryFilter || coachFilter || searchFilter
            ? t("noCoursesMatch")
            : t("noCoursesAvailable")}
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {courseList.map((course) => (
              <Card key={course._id} className="flex h-full flex-col overflow-hidden">
                {course.thumbnail_image_url ? (
                  <div className="relative h-48 w-full overflow-hidden">
                    <img
                      src={course.thumbnail_image_url}
                      alt={course.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="flex h-48 w-full items-center justify-center bg-muted text-sm text-muted-foreground">
                    {t("noImage")}
                  </div>
                )}
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge
                      variant="secondary"
                      className="w-fit rounded-full bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300"
                    >
                      {categoryNameById[course.category_id] ?? t("uncategorized")}
                    </Badge>
                    {(course.additional_category_ids ?? []).length > 0 && (
                      <Badge
                        variant="outline"
                        className="w-fit rounded-full border-muted-foreground/30 text-muted-foreground"
                      >
                        +{(course.additional_category_ids ?? []).length}
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg font-bold leading-tight">
                    {language === "ar" ? course.name_ar : course.name}
                  </CardTitle>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {markdownToPlainText(
                      language === "ar" 
                        ? (course.short_description_ar ?? course.short_description ?? t("noDescription"))
                        : (course.short_description ?? t("noDescription"))
                    )}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatLessonCount(course.lesson_count, t)}</span>
                    <span aria-hidden="true">•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatDurationTime(course.duration)}</span>
                    </span>
                  </div>
                </CardHeader>
                <CardFooter className="mt-auto pt-0">
                  <Button
                    className="w-full rounded-lg bg-pink-500 text-white hover:bg-pink-600"
                    onClick={() => {
                      const currentLang = searchParams.get("lang");
                      const url = `/courses/preview/${course._id}${currentLang ? `?lang=${currentLang}` : ""}`;
                      navigate(url);
                    }}
                  >
                    {t("viewCourse")}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
          {showPagination && (
            <nav
              role="navigation"
              aria-label="pagination"
              className="mt-8 flex flex-wrap items-center justify-center gap-2"
            >
              <Button
                variant="outline"
                size="default"
                onClick={handlePrevPage}
                disabled={prevCursors.length === 0}
                className="gap-1"
              >
                {isRTL ? (
                  <ChevronRight className="h-4 w-4" aria-hidden />
                ) : (
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                )}
                {t("previousPage")}
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={handleNextPage}
                disabled={!courses?.continueCursor || courses.isDone}
                className="gap-1"
              >
                {t("nextPage")}
                {isRTL ? (
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                ) : (
                  <ChevronRight className="h-4 w-4" aria-hidden />
                )}
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
};

export default CourseCards;

