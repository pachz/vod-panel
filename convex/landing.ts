import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

type LandingCourse = {
  id: Id<"courses">;
  slug: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  categoryNameEn: string;
  categoryNameAr: string;
  durationMinutes: number;
  coverImageUrl: string;
};

type LandingCourseLesson = {
  id: Id<"lessons">;
  titleEn: string;
  titleAr: string;
  durationMinutes: number;
};

type LandingCourseDetail = LandingCourse & {
  shortDescriptionEn: string;
  shortDescriptionAr: string;
  instructor: string;
  trialVideoUrl: string;
  thumbnailImageUrl: string;
  lessons: Array<LandingCourseLesson>;
};

export const listLandingCourses = internalQuery({
  args: {
    limit: v.number(),
  },
  returns: v.array(
    v.object({
      id: v.id("courses"),
      slug: v.string(),
      titleEn: v.string(),
      titleAr: v.string(),
      descriptionEn: v.string(),
      descriptionAr: v.string(),
      categoryNameEn: v.string(),
      categoryNameAr: v.string(),
      durationMinutes: v.number(),
      coverImageUrl: v.string(),
    }),
  ),
  handler: async (ctx, args): Promise<Array<LandingCourse>> => {
    const normalizedLimit = Math.min(Math.max(Math.floor(args.limit), 5), 10);

    const courses = await ctx.db
      .query("courses")
      .withIndex("deletedAt_status", (q) =>
        q.eq("deletedAt", undefined).eq("status", "published"),
      )
      .order("desc")
      .take(normalizedLimit);

    const categoryIds = Array.from(
      new Set<Id<"categories">>(courses.map((course) => course.category_id)),
    );

    const categories = await Promise.all(
      categoryIds.map(async (categoryId) => {
        const category = await ctx.db.get(categoryId);
        if (category && category.deletedAt === undefined) {
          return category;
        }
        return null;
      }),
    );

    const categoryMap = new Map<Id<"categories">, Doc<"categories">>();
    for (const category of categories) {
      if (category) {
        categoryMap.set(category._id, category);
      }
    }

    return courses.map((course) => {
      const category = categoryMap.get(course.category_id);

      return {
        id: course._id,
        slug: course.slug,
        titleEn: course.name,
        titleAr: course.name_ar,
        descriptionEn: course.description ?? course.short_description,
        descriptionAr: course.description_ar ?? course.short_description_ar,
        categoryNameEn: category?.name ?? "",
        categoryNameAr: category?.name_ar ?? "",
        durationMinutes: course.duration ?? 0,
        coverImageUrl:
          course.banner_image_url ??
          course.thumbnail_image_url ??
          "",
      };
    });
  },
});

export const getLandingCourseBySlug = internalQuery({
  args: {
    slug: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("courses"),
      slug: v.string(),
      titleEn: v.string(),
      titleAr: v.string(),
      descriptionEn: v.string(),
      descriptionAr: v.string(),
      shortDescriptionEn: v.string(),
      shortDescriptionAr: v.string(),
      categoryNameEn: v.string(),
      categoryNameAr: v.string(),
      durationMinutes: v.number(),
      coverImageUrl: v.string(),
      thumbnailImageUrl: v.string(),
      instructor: v.string(),
      trialVideoUrl: v.string(),
      lessons: v.array(
        v.object({
          id: v.id("lessons"),
          titleEn: v.string(),
          titleAr: v.string(),
          durationMinutes: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args): Promise<LandingCourseDetail | null> => {
    const courses = await ctx.db
      .query("courses")
      .withIndex("slug", (q) => q.eq("slug", args.slug))
      .collect();

    const course = courses.find(
      (candidate) =>
        candidate.deletedAt === undefined && candidate.status === "published",
    );

    if (!course) {
      return null;
    }

    const category = await ctx.db.get(course.category_id);

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("deletedAt_course_status", (q) =>
        q
          .eq("deletedAt", undefined)
          .eq("course_id", course._id)
          .eq("status", "published"),
      )
      .collect();

    lessons.sort((a, b) => a.priority - b.priority);

    return {
      id: course._id,
      slug: course.slug,
      titleEn: course.name,
      titleAr: course.name_ar,
      descriptionEn: course.description ?? "",
      descriptionAr: course.description_ar ?? "",
      shortDescriptionEn: course.short_description,
      shortDescriptionAr: course.short_description_ar,
      categoryNameEn: category?.name ?? "",
      categoryNameAr: category?.name_ar ?? "",
      durationMinutes: course.duration ?? 0,
      coverImageUrl:
        course.banner_image_url ?? course.thumbnail_image_url ?? "",
      thumbnailImageUrl: course.thumbnail_image_url ?? "",
      instructor: course.instructor ?? "",
      trialVideoUrl: course.trial_video_url ?? "",
      lessons: lessons.map((lesson) => ({
        id: lesson._id,
        titleEn: lesson.title,
        titleAr: lesson.title_ar,
        durationMinutes: lesson.duration ?? 0,
      })),
    };
  },
});

