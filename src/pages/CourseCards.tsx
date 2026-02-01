import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Clock } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/use-language";
import { markdownToPlainText } from "@/lib/utils";

type CourseDoc = Doc<"courses">;
type CategoryDoc = Doc<"categories">;

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

const CourseCards = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFilter = searchParams.get("category") || undefined;
  const searchFilter = searchParams.get("search") || undefined;
  const { language, t, isRTL } = useLanguage();

  const courses = useQuery(api.course.listCourses, {
    categoryId: categoryFilter as Id<"categories"> | undefined,
    status: "published",
    search: searchFilter,
    limit: 72,
  });

  const categories = useQuery(api.category.listCategories);
  const categoryIdsWithPublishedCourses = useQuery(
    api.course.getCategoryIdsWithPublishedCourses
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

      <div className="mx-auto w-full max-w-lg">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t("searchCourse")}
          className="text-center"
          dir={isRTL ? "rtl" : "ltr"}
        />
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {t("loadingCourses")}
        </div>
      ) : courseList.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {categoryFilter || searchFilter
            ? t("noCoursesMatch")
            : t("noCoursesAvailable")}
        </div>
      ) : (
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
                  {(course.additional_category_ids ?? []).map((id) => (
                    <Badge
                      key={id}
                      variant="outline"
                      className="w-fit rounded-full border-muted-foreground/30 text-muted-foreground"
                    >
                      {categoryNameById[id] ?? t("uncategorized")}
                    </Badge>
                  ))}
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
      )}
    </div>
  );
};

export default CourseCards;

