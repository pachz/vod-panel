import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

type AdditionalCategory = {
  id: Id<"categories">;
  nameEn: string;
  nameAr: string;
};

type LandingCourse = {
  id: Id<"courses">;
  slug: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  shortDescriptionEn: string;
  shortDescriptionAr: string;
  categoryNameEn: string;
  categoryNameAr: string;
  additionalCategoryIds: Array<Id<"categories">>;
  additionalCategories: Array<AdditionalCategory>;
  durationMinutes: number;
  coverImageUrl: string;
  updatedAt: number;
};

type LandingCourseLesson = {
  id: Id<"lessons">;
  titleEn: string;
  titleAr: string;
  durationMinutes: number;
};

type LandingCourseDetail = Omit<LandingCourse, "shortDescriptionEn" | "shortDescriptionAr"> & {
  shortDescriptionEn: string;
  shortDescriptionAr: string;
  instructor: string;
  trialVideoUrl: string;
  thumbnailImageUrl: string;
  lessons: Array<LandingCourseLesson>;
};

type LandingCoachProfile = {
  nameEn: string;
  nameAr: string;
  expertiseEn: string;
  expertiseAr: string;
  descriptionEn: string;
  descriptionAr: string;
  rating: number;
  profileImageUrl: string | null;
  profileThumbnailUrl: string | null;
  lastUpdatedAt: number;
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
      shortDescriptionEn: v.string(),
      shortDescriptionAr: v.string(),
      categoryNameEn: v.string(),
      categoryNameAr: v.string(),
      additionalCategoryIds: v.array(v.id("categories")),
      additionalCategories: v.array(
        v.object({
          id: v.id("categories"),
          nameEn: v.string(),
          nameAr: v.string(),
        }),
      ),
      durationMinutes: v.number(),
      coverImageUrl: v.string(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args): Promise<Array<LandingCourse>> => {
    const normalizedLimit = Math.min(Math.max(Math.floor(args.limit), 5), 200);

    const courses = await ctx.db
      .query("courses")
      .withIndex("deletedAt_status", (q) =>
        q.eq("deletedAt", undefined).eq("status", "published"),
      )
      .collect();

    // Sort by displayOrder (default 50 if null), then by createdAt and _id for consistency
    courses.sort((a, b) => {
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

      return a._id.localeCompare(b._id);
    });

    const sortedCourses = courses.slice(0, normalizedLimit);

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

    const allAdditionalIds = Array.from(
      new Set<Id<"categories">>(
        sortedCourses.flatMap((c) => c.additional_category_ids ?? []),
      ),
    );
    for (const categoryId of allAdditionalIds) {
      if (!categoryMap.has(categoryId)) {
        const category = await ctx.db.get(categoryId);
        if (category && category.deletedAt === undefined) {
          categoryMap.set(categoryId, category);
        }
      }
    }

    return sortedCourses.map((course) => {
      const category = categoryMap.get(course.category_id);
      const additionalCategoryIds = course.additional_category_ids ?? [];
      const additionalCategories: Array<AdditionalCategory> = additionalCategoryIds
        .map((catId) => {
          const cat = categoryMap.get(catId);
          if (!cat) return null;
          return { id: cat._id, nameEn: cat.name, nameAr: cat.name_ar };
        })
        .filter((c): c is AdditionalCategory => c !== null);

      return {
        id: course._id,
        slug: course.slug,
        titleEn: course.name,
        titleAr: course.name_ar,
        descriptionEn: course.description ?? course.short_description ?? "",
        descriptionAr: course.description_ar ?? course.short_description_ar ?? "",
        shortDescriptionEn: course.short_description ?? "",
        shortDescriptionAr: course.short_description_ar ?? "",
        categoryNameEn: category?.name ?? "",
        categoryNameAr: category?.name_ar ?? "",
        additionalCategoryIds,
        additionalCategories,
        durationMinutes: Math.round((course.duration ?? 0) / 60),
        coverImageUrl:
          course.banner_image_url ??
          course.thumbnail_image_url ??
          "",
        updatedAt: course.updatedAt ?? course.createdAt,
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
      additionalCategoryIds: v.array(v.id("categories")),
      additionalCategories: v.array(
        v.object({
          id: v.id("categories"),
          nameEn: v.string(),
          nameAr: v.string(),
        }),
      ),
      durationMinutes: v.number(),
      coverImageUrl: v.string(),
      thumbnailImageUrl: v.string(),
      instructor: v.string(),
      trialVideoUrl: v.string(),
      coachId: v.union(v.id("coaches"), v.null()),
      lessons: v.array(
        v.object({
          id: v.id("lessons"),
          titleEn: v.string(),
          titleAr: v.string(),
          durationMinutes: v.number(),
        }),
      ),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args): Promise<(LandingCourseDetail & { coachId: Id<"coaches"> | null }) | null> => {
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
    const additionalCategoryIds = course.additional_category_ids ?? [];
    const additionalCategories: Array<AdditionalCategory> = await Promise.all(
      additionalCategoryIds.map(async (catId) => {
        const cat = await ctx.db.get(catId);
        if (!cat || cat.deletedAt !== undefined) {
          return null;
        }
        return { id: cat._id, nameEn: cat.name, nameAr: cat.name_ar };
      }),
    ).then((arr) => arr.filter((c): c is AdditionalCategory => c !== null));

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
      shortDescriptionEn: course.short_description ?? "",
      shortDescriptionAr: course.short_description_ar ?? "",
      categoryNameEn: category?.name ?? "",
      categoryNameAr: category?.name_ar ?? "",
      additionalCategoryIds,
      additionalCategories,
      durationMinutes: Math.round((course.duration ?? 0) / 60),
      coverImageUrl:
        course.banner_image_url ?? course.thumbnail_image_url ?? "",
      thumbnailImageUrl: course.thumbnail_image_url ?? "",
      instructor: course.instructor ?? "",
      trialVideoUrl: course.trial_video_url ?? "",
      coachId: course.coach_id ?? null,
      updatedAt: course.updatedAt ?? course.createdAt,
      lessons: lessons.map((lesson) => ({
        id: lesson._id,
        titleEn: lesson.title,
        titleAr: lesson.title_ar,
        durationMinutes: Math.round((lesson.duration ?? 0) / 60),
      })),
    };
  },
});

export const getCoachById = internalQuery({
  args: {
    coachId: v.id("coaches"),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("coaches"),
      _creationTime: v.number(),
      nameEn: v.string(),
      nameAr: v.string(),
      expertiseEn: v.string(),
      expertiseAr: v.string(),
      descriptionEn: v.string(),
      descriptionAr: v.string(),
      rating: v.number(),
      profileImageUrl: v.union(v.null(), v.string()),
      profileThumbnailUrl: v.union(v.null(), v.string()),
      courseCount: v.union(v.number(), v.null()),
      lastUpdatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args): Promise<{
    _id: Id<"coaches">;
    _creationTime: number;
    nameEn: string;
    nameAr: string;
    expertiseEn: string;
    expertiseAr: string;
    descriptionEn: string;
    descriptionAr: string;
    rating: number;
    profileImageUrl: string | null;
    profileThumbnailUrl: string | null;
    courseCount: number | null;
    lastUpdatedAt: number;
  } | null> => {
    const coach = await ctx.db.get(args.coachId);
    if (!coach || coach.deletedAt !== undefined) {
      return null;
    }
    return {
      _id: coach._id,
      _creationTime: coach._creationTime,
      nameEn: coach.name,
      nameAr: coach.name_ar,
      expertiseEn: coach.expertise,
      expertiseAr: coach.expertise_ar,
      descriptionEn: coach.description,
      descriptionAr: coach.description_ar,
      rating: coach.rating,
      profileImageUrl: coach.profile_image_url ?? null,
      profileThumbnailUrl: coach.profile_thumbnail_url ?? null,
      courseCount: coach.course_count ?? null,
      lastUpdatedAt: coach.updatedAt,
    };
  },
});

export const getFeaturedCoach = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      nameEn: v.string(),
      nameAr: v.string(),
      expertiseEn: v.string(),
      expertiseAr: v.string(),
      descriptionEn: v.string(),
      descriptionAr: v.string(),
      rating: v.number(),
      profileImageUrl: v.union(v.null(), v.string()),
      profileThumbnailUrl: v.union(v.null(), v.string()),
      lastUpdatedAt: v.number(),
    }),
  ),
  handler: async (ctx): Promise<LandingCoachProfile | null> => {
    const [coach] = await ctx.db.query("coaches").take(1);
    if (!coach) {
      return null;
    }

    return {
      nameEn: coach.name,
      nameAr: coach.name_ar,
      expertiseEn: coach.expertise,
      expertiseAr: coach.expertise_ar,
      descriptionEn: coach.description,
      descriptionAr: coach.description_ar,
      rating: coach.rating,
      profileImageUrl: coach.profile_image_url ?? null,
      profileThumbnailUrl: coach.profile_thumbnail_url ?? null,
      lastUpdatedAt: coach.updatedAt,
    };
  },
});

