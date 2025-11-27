import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type CourseDoc = Doc<"courses">;
type CategoryDoc = Doc<"categories">;

const formatDuration = (minutes: number | undefined) => {
  if (minutes === undefined || minutes === null) {
    return "—";
  }

  return `${minutes} min`;
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
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {courseList.map((course) => (
            <Card key={course._id} className="flex h-full flex-col overflow-hidden">
              {course.thumbnail_image_url ? (
                <img
                  src={course.thumbnail_image_url}
                  alt={course.name}
                  className="h-48 w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-48 w-full items-center justify-center bg-muted text-sm text-muted-foreground">
                  No image
                </div>
              )}
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <Badge variant="secondary">
                    {categoryNameById[course.category_id] ?? "Uncategorized"}
                  </Badge>
                  <span className="text-muted-foreground">{formatDuration(course.duration)}</span>
                </div>
                <CardTitle className="text-xl leading-tight">{course.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-muted-foreground">
                  {course.short_description ?? "No description available."}
                </p>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate(`/courses/preview/${course._id}`)}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View course
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

