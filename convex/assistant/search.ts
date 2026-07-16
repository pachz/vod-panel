import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  getCourseAccessStatus,
  pickLocalizedCourseText,
  secondsToMinutes,
} from "./lib";
import { isCourseRelevantToQuery } from "./courseSearchRelevance";
import {
  assistantLanguageValidator,
  courseSearchResultValidator,
} from "./validators";

const MAX_RESULTS = 10;
const DEFAULT_RESULTS = 5;
const SEARCH_CANDIDATE_MULTIPLIER = 4;

function normalizeLimit(limit: number | undefined): number {
  const requested = limit ?? DEFAULT_RESULTS;
  return Math.min(Math.max(requested, 1), MAX_RESULTS);
}

function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

async function searchPublishedCourses(
  ctx: import("../_generated/server").QueryCtx,
  searchField: "search_text_en" | "search_text_ar" | "name_search",
  searchIndex: "search_courses_en" | "search_courses_ar" | "search_name",
  query: string,
  limit: number,
): Promise<Array<Doc<"courses">>> {
  return await ctx.db
    .query("courses")
    .withSearchIndex(searchIndex, (q) =>
      q.search(searchField, query).eq("deletedAt", undefined).eq("status", "published"),
    )
    .take(limit);
}

async function mapCourseToResult(
  ctx: import("../_generated/server").QueryCtx,
  course: Doc<"courses">,
  language: "en" | "ar",
  userId: Id<"users"> | null,
  nowMs: number,
) {
  const category = await ctx.db.get(course.category_id);
  const categoryEn =
    category && category.deletedAt === undefined ? category.name : undefined;
  const categoryAr =
    category && category.deletedAt === undefined ? category.name_ar : undefined;

  const title = pickLocalizedCourseText(language, course.name, course.name_ar);
  const description = pickLocalizedCourseText(
    language,
    course.short_description ?? course.description,
    course.short_description_ar ?? course.description_ar,
  );
  const categoryLabel = pickLocalizedCourseText(language, categoryEn, categoryAr);

  const accessStatus = await getCourseAccessStatus(ctx, userId, course._id, nowMs);

  return {
    id: course._id,
    title: title.text,
    titleEn: course.name || undefined,
    titleAr: course.name_ar || undefined,
    description: description.text,
    descriptionEn: (course.short_description ?? course.description) || undefined,
    descriptionAr:
      (course.short_description_ar ?? course.description_ar) || undefined,
    slug: course.slug,
    imageUrl: course.thumbnail_image_url ?? course.banner_image_url,
    category: categoryLabel.text || undefined,
    categoryEn: categoryEn || undefined,
    categoryAr: categoryAr || undefined,
    durationMinutes: secondsToMinutes(course.duration),
    accessStatus,
    language,
    usedFallbackTranslation:
      title.usedFallbackTranslation || description.usedFallbackTranslation,
  };
}

export const searchCoursesInternal = internalQuery({
  args: {
    query: v.string(),
    language: v.optional(assistantLanguageValidator),
    limit: v.optional(v.number()),
    userId: v.union(v.id("users"), v.null()),
    nowMs: v.number(),
  },
  returns: v.array(courseSearchResultValidator),
  handler: async (ctx, args) => {
    const searchTerm = args.query.trim();
    if (searchTerm.length === 0) {
      return [];
    }

    const limit = normalizeLimit(args.limit);
    const language = args.language ?? (containsArabic(searchTerm) ? "ar" : "en");
    const searchBoth = !args.language && !containsArabic(searchTerm);
    const candidateLimit = Math.min(limit * SEARCH_CANDIDATE_MULTIPLIER, 40);

    const seen = new Set<string>();
    const courses: Array<Doc<"courses">> = [];

    const addCourses = (results: Array<Doc<"courses">>) => {
      for (const course of results) {
        if (seen.has(course._id)) {
          continue;
        }
        seen.add(course._id);
        courses.push(course);
        if (courses.length >= candidateLimit) {
          break;
        }
      }
    };

    if (language === "en" || searchBoth) {
      const enResults = await searchPublishedCourses(
        ctx,
        "search_text_en",
        "search_courses_en",
        searchTerm,
        candidateLimit,
      );
      addCourses(enResults);

      if (courses.length < candidateLimit) {
        const fallbackResults = await searchPublishedCourses(
          ctx,
          "name_search",
          "search_name",
          searchTerm,
          candidateLimit - courses.length,
        );
        addCourses(fallbackResults);
      }
    }

    if ((language === "ar" || searchBoth) && courses.length < candidateLimit) {
      const arResults = await searchPublishedCourses(
        ctx,
        "search_text_ar",
        "search_courses_ar",
        searchTerm,
        candidateLimit - courses.length,
      );
      addCourses(arResults);

      if (courses.length < candidateLimit) {
        const fallbackResults = await searchPublishedCourses(
          ctx,
          "name_search",
          "search_name",
          searchTerm,
          candidateLimit - courses.length,
        );
        addCourses(fallbackResults);
      }
    }

    const relevantCourses: Array<Doc<"courses">> = [];
    for (const course of courses) {
      const category = await ctx.db.get(course.category_id);
      if (!isCourseRelevantToQuery(course, category, searchTerm)) {
        continue;
      }
      relevantCourses.push(course);
      if (relevantCourses.length >= limit) {
        break;
      }
    }

    return await Promise.all(
      relevantCourses.map((course) =>
        mapCourseToResult(ctx, course, language, args.userId, args.nowMs),
      ),
    );
  },
});
