import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Clock, ChevronDown, Search } from "lucide-react";
import { useQuery } from "convex/react";
import { format } from "date-fns";
import { arSA, enUS } from "date-fns/locale";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 9;

const UserBlogs = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFilter = searchParams.get("category") || undefined;
  const searchFilter = searchParams.get("search") || undefined;
  const { language, t, isRTL } = useLanguage();

  const [searchInput, setSearchInput] = useState(searchFilter || "");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [continueCursor, setContinueCursor] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [cursorScope, setCursorScope] = useState<string | null>(null);
  const [blogs, setBlogs] = useState<
    NonNullable<ReturnType<typeof useQuery<typeof api.blog.listPublishedBlogs>>>["page"]
  >([]);

  const filterKey = useMemo(
    () => `${categoryFilter ?? ""}|${searchFilter ?? ""}`,
    [categoryFilter, searchFilter],
  );

  const blogsPage = useQuery(api.blog.listPublishedBlogs, {
    categoryId: categoryFilter as Id<"blogCategories"> | undefined,
    search: searchFilter,
    limit: PAGE_SIZE,
    cursor: cursor !== null && cursorScope === filterKey ? cursor : undefined,
  });

  const categories = useQuery(api.blogCategory.listBlogCategories);
  const categoryIdsWithBlogs = useQuery(api.blog.listPublishedBlogCategoryIds);

  useEffect(() => {
    setSearchInput(searchFilter || "");
  }, [searchFilter]);

  useEffect(() => {
    setCursor(null);
    setContinueCursor(null);
    setIsDone(false);
    setBlogs([]);
    setCursorScope(null);
  }, [filterKey]);

  useEffect(() => {
    if (!blogsPage) return;
    setContinueCursor(blogsPage.continueCursor);
    setIsDone(blogsPage.isDone);
    setCursorScope(filterKey);
    setBlogs((prev) => {
      if (cursor === null || cursorScope !== filterKey) {
        return blogsPage.page;
      }
      const existingIds = new Set(prev.map((b) => b._id));
      return [...prev, ...blogsPage.page.filter((b) => !existingIds.has(b._id))];
    });
    setIsLoadingMore(false);
  }, [blogsPage, cursor, cursorScope, filterKey]);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const value = searchInput.trim();
          if (value) next.set("search", value);
          else next.delete("search");
          return next;
        },
        { replace: true },
      );
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchInput, setSearchParams]);

  const filterableCategories = useMemo(() => {
    const ids = new Set(categoryIdsWithBlogs ?? []);
    return (categories ?? []).filter(
      (c) => ids.has(c._id) || c._id === categoryFilter,
    );
  }, [categories, categoryIdsWithBlogs, categoryFilter]);

  const handleCategorySelect = useCallback(
    (categoryId?: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (categoryId) next.set("category", categoryId);
          else next.delete("category");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleLoadMore = () => {
    if (continueCursor && !isDone && !isLoadingMore) {
      setIsLoadingMore(true);
      setCursor(continueCursor);
    }
  };

  const isLoading = blogsPage === undefined && blogs.length === 0;
  const dateLocale = language === "ar" ? arSA : enUS;

  return (
    <div className="mx-auto max-w-6xl space-y-10" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3 text-center sm:text-start sm:flex-1">
          <div className="inline-flex flex-col items-center gap-2 sm:items-start">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t("blogs")}</h1>
            <span className="h-1 w-16 rounded-full bg-pink-500" />
          </div>
          <p className="mx-auto max-w-xl text-muted-foreground sm:mx-0">
            {t("blogsPageSubtitle")}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search
            className={cn(
              "absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
              isRTL ? "right-3" : "left-3",
            )}
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("searchArticles")}
            className={cn(
              "h-11 rounded-full border-border/60 bg-background",
              isRTL ? "pr-10" : "pl-10",
            )}
          />
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
        <button
          type="button"
          onClick={() => handleCategorySelect(undefined)}
          className={cn(
            "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
            !categoryFilter
              ? "border-pink-500 text-pink-600"
              : "border-border text-foreground hover:border-pink-300",
          )}
        >
          {t("allCategories")}
        </button>
        {filterableCategories.map((category) => {
          const isActive = categoryFilter === category._id;
          const name = language === "ar" ? category.name_ar : category.name;
          return (
            <button
              key={category._id}
              type="button"
              onClick={() => handleCategorySelect(category._id)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-pink-500 text-pink-600"
                  : "border-border text-foreground hover:border-pink-300",
              )}
            >
              {name}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">{t("loading")}</div>
      ) : blogs.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          {t("noBlogsAvailable")}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {blogs.map((blog) => {
            const title = language === "ar" ? blog.title_ar : blog.title;
            const excerpt =
              language === "ar" ? blog.simple_content_ar : blog.simple_content;
            const categoryName =
              language === "ar" ? blog.category.name_ar : blog.category.name;
            const authorName =
              language === "ar" ? blog.author.name_ar : blog.author.name;
            const imageUrl = blog.thumbnail_image_url ?? blog.image_url;
            const authorImage =
              blog.author.profile_thumbnail_url ?? blog.author.profile_image_url;
            const publishedLabel = blog.publishedAt
              ? format(new Date(blog.publishedAt), "d MMM yyyy", {
                  locale: dateLocale,
                })
              : null;

            return (
              <article
                key={blog._id}
                className="overflow-hidden rounded-2xl border border-border/40 bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="aspect-[16/10] overflow-hidden bg-muted">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={title}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="space-y-3 p-5">
                  <span
                    className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      color: blog.category.color,
                      borderColor: `${blog.category.color}55`,
                      backgroundColor: `${blog.category.color}14`,
                    }}
                  >
                    {categoryName}
                  </span>
                  <h2 className="text-lg font-semibold leading-snug tracking-tight">
                    {title}
                  </h2>
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {excerpt}
                  </p>
                  <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-4 text-xs text-muted-foreground">
                    <div className="flex min-w-0 items-center gap-2">
                      {authorImage ? (
                        <img
                          src={authorImage}
                          alt=""
                          className="h-7 w-7 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                          {authorName.slice(0, 1)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{authorName}</p>
                        {publishedLabel ? <p>{publishedLabel}</p> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {blog.reading_time_minutes} {t("minRead")}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!isDone && blogs.length > 0 && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="h-11 rounded-full border-pink-500 px-6 text-pink-600 hover:bg-pink-50 hover:text-pink-700"
          >
            {isLoadingMore ? t("loading") : t("loadMoreArticles")}
            <ChevronDown className="ms-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default UserBlogs;
