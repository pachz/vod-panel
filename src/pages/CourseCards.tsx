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

type CourseDoc = Doc<"courses">;
type CategoryDoc = Doc<"categories">;

const formatDuration = (minutes: number | undefined) => {
  if (minutes === undefined || minutes === null) {
    return "0m";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (remainder === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
};

const CourseCards = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFilter = searchParams.get("category") || undefined;
  const searchFilter = searchParams.get("search") || undefined;

  const courses = useQuery(api.course.listCourses, {
    categoryId: categoryFilter as Id<"categories"> | undefined,
    status: "published",
    search: searchFilter,
  });
  const categories = useQuery(api.category.listCategories);

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

  const courseList = useMemo<CourseDoc[]>(() => courses ?? [], [courses]);
  const categoryList = useMemo<CategoryDoc[]>(() => categories ?? [], [categories]);
  const isLoading = courses === undefined;

  const categoryNameById = useMemo(() => {
    return categoryList.reduce<Record<string, string>>((acc, category) => {
      acc[category._id] = category.name;
      return acc;
    }, {});
  }, [categoryList]);

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
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">All Courses</h1>
        <p className="text-muted-foreground">
          Discover our comprehensive collection of courses designed to help you grow, learn, and achieve your goals.
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
          All categories
        </button>
        {categoryList.map((category) => {
          const isActive = categoryFilter === category._id;
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
              {category.name}
            </button>
          );
        })}
      </div>

      <div className="mx-auto w-full max-w-lg">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search Course"
          className="text-center"
        />
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Loading courses…
        </div>
      ) : courseList.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {categoryFilter || searchFilter
            ? "No courses match your filters."
            : "No courses available yet."}
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
                  No image
                </div>
              )}
              <CardHeader className="space-y-3">
                <Badge 
                  variant="secondary" 
                  className="w-fit rounded-full bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300"
                >
                  {categoryNameById[course.category_id] ?? "Uncategorized"}
                </Badge>
                <CardTitle className="text-lg font-bold leading-tight">{course.name}</CardTitle>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {course.short_description ?? "No description available."}
                </p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formatDuration(course.duration)}</span>
                </div>
              </CardHeader>
              <CardFooter className="mt-auto pt-0">
                <Button
                  className="w-full rounded-lg bg-pink-500 text-white hover:bg-pink-600"
                  onClick={() => navigate(`/courses/preview/${course._id}`)}
                >
                  View Course
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

