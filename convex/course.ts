import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";

import {
  courseInputSchema,
  courseUpdateSchema,
  type CourseInput,
  type CourseUpdateInput,
} from "../shared/validation/course";
import { generateUniqueSlug, slugify } from "./utils/slug";
import { requireUser } from "./utils/auth";
import { logActivity } from "./utils/activityLog";

const validateCourseInput = (input: CourseInput) => {
  const result = courseInputSchema.safeParse(input);

  if (!result.success) {
    const issue = result.error.errors[0];
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: issue?.message ?? "Invalid course input.",
    });
  }

  return result.data;
};

const validateCourseUpdateInput = (input: CourseUpdateInput) => {
  const result = courseUpdateSchema.safeParse(input);

  if (!result.success) {
    const issue = result.error.errors[0];
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: issue?.message ?? "Invalid course input.",
    });
  }

  return result.data;
};

export const listCourses = query({
  args: {
    categoryId: v.optional(v.id("categories")),
    status: v.optional(v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    )),
  },
  handler: async (ctx, { categoryId, status }) => {
    await requireUser(ctx);

    // Use single composite index for all cases
    // Index: ["deletedAt", "category_id", "status"]
    let courses;

    if (categoryId && status) {
      // Case 3: Both filters - use all 3 fields
      courses = await ctx.db
        .query("courses")
        .withIndex("deletedAt_category_status", (q) =>
          q.eq("deletedAt", undefined).eq("category_id", categoryId).eq("status", status)
        )
        .collect();
    } else if (categoryId) {
      // Case 2: Category only - use first 2 fields
      courses = await ctx.db
        .query("courses")
        .withIndex("deletedAt_category_status", (q) =>
          q.eq("deletedAt", undefined).eq("category_id", categoryId)
        )
        .collect();
    } else if (status) {
      // Status only - use deletedAt_status index
      courses = await ctx.db
        .query("courses")
        .withIndex("deletedAt_status", (q) =>
          q.eq("deletedAt", undefined).eq("status", status)
        )
        .collect();
    } else {
      // Case 1: No filters - use only deletedAt
      courses = await ctx.db
        .query("courses")
        .withIndex("deletedAt_category_status", (q) =>
          q.eq("deletedAt", undefined)
        )
        .collect();
    }

    return courses.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const createCourse = mutation({
  args: {
    name: v.string(),
    nameAr: v.string(),
    shortDescription: v.string(),
    shortDescriptionAr: v.string(),
    categoryId: v.id("categories"),
  },
  handler: async (
    ctx,
    { name, nameAr, shortDescription, shortDescriptionAr, categoryId },
  ) => {
    await requireUser(ctx);

    const validated = validateCourseInput({
      name,
      nameAr,
      shortDescription,
      shortDescriptionAr,
      categoryId,
    });

    const category = await ctx.db.get(categoryId);

    if (!category || category.deletedAt) {
      throw new ConvexError({
        code: "INVALID_CATEGORY",
        message: "Selected category does not exist.",
      });
    }

    const duplicates = await ctx.db
      .query("courses")
      .withIndex("name", (q) => q.eq("name", validated.name))
      .collect();

    const hasDuplicate = duplicates.some(
      (item) => item.deletedAt === undefined,
    );

    if (hasDuplicate) {
      throw new ConvexError({
        code: "COURSE_EXISTS",
        message: "A course with this name already exists.",
      });
    }

    const baseSlug = slugify(validated.name);
    const slug = await generateUniqueSlug(ctx, "courses", baseSlug, {
      fallbackSlug: "course",
    });
    const now = Date.now();

    const courseId = await ctx.db.insert("courses", {
      name: validated.name,
      name_ar: validated.nameAr,
      short_description: validated.shortDescription,
      short_description_ar: validated.shortDescriptionAr,
      slug,
      category_id: categoryId,
      status: "draft",
      createdAt: now,
      lesson_count: 0,
      description: undefined,
      description_ar: undefined,
      trial_video_url: undefined,
      duration: undefined,
      instructor: undefined,
      banner_image_url: undefined,
      thumbnail_image_url: undefined,
    });

    await ctx.db.patch(categoryId, {
      course_count: category.course_count + 1,
    });

    await logActivity({
      ctx,
      entityType: "course",
      action: "created",
      entityId: courseId,
      entityName: validated.name,
    });

    return courseId;
  },
});

export const getCourse = query({
  args: {
    id: v.id("courses"),
  },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);

    const course = await ctx.db.get(id);

    if (!course || course.deletedAt) {
      return null;
    }

    return course;
  },
});

export const updateCourse = mutation({
  args: {
    id: v.id("courses"),
    name: v.string(),
    nameAr: v.string(),
    shortDescription: v.string(),
    shortDescriptionAr: v.string(),
    description: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
    categoryId: v.id("categories"),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),
    trialVideoUrl: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    instructor: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      id,
      name,
      nameAr,
      shortDescription,
      shortDescriptionAr,
      description,
      descriptionAr,
      categoryId,
      status,
      trialVideoUrl,
      durationMinutes,
      instructor,
    },
  ) => {
    await requireUser(ctx);

    const course = await ctx.db.get(id);

    if (!course || course.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Course not found.",
      });
    }

    const validated = validateCourseUpdateInput({
      name,
      nameAr,
      shortDescription,
      shortDescriptionAr,
      description,
      descriptionAr,
      categoryId,
      status,
      trialVideoUrl,
      durationMinutes,
      instructor,
    });

    const targetCategory = await ctx.db.get(categoryId);

    if (!targetCategory || targetCategory.deletedAt) {
      throw new ConvexError({
        code: "INVALID_CATEGORY",
        message: "Selected category does not exist.",
      });
    }

    const duplicates = await ctx.db
      .query("courses")
      .withIndex("name", (q) => q.eq("name", validated.name))
      .collect();

    const hasDuplicate = duplicates.some(
      (item) => item._id !== id && item.deletedAt === undefined,
    );

    if (hasDuplicate) {
      throw new ConvexError({
        code: "COURSE_EXISTS",
        message: "A course with this name already exists.",
      });
    }

    const baseSlug = slugify(validated.name);
    const slug = await generateUniqueSlug(ctx, "courses", baseSlug, {
      excludeId: id,
      fallbackSlug: "course",
    });

    if (validated.status === "published") {
      const hasDescriptions =
        validated.description !== undefined &&
        validated.descriptionAr !== undefined;
      const hasDuration =
        validated.durationMinutes !== undefined && validated.durationMinutes > 0;
      const hasCoverImages =
        typeof course.banner_image_url === "string" &&
        course.banner_image_url.trim().length > 0 &&
        typeof course.thumbnail_image_url === "string" &&
        course.thumbnail_image_url.trim().length > 0;

      if (!hasDescriptions || !hasDuration || !hasCoverImages) {
        throw new ConvexError({
          code: "COURSE_INCOMPLETE",
          message:
            "Published courses must include English and Arabic descriptions, a duration, and cover images.",
        });
      }
    }

    if (course.category_id !== categoryId) {
      const currentCategory = await ctx.db.get(course.category_id);

      if (currentCategory && currentCategory.deletedAt === undefined) {
        await ctx.db.patch(course.category_id, {
          course_count: Math.max(currentCategory.course_count - 1, 0),
        });
      }

      await ctx.db.patch(categoryId, {
        course_count: targetCategory.course_count + 1,
      });
    }

    await ctx.db.patch(id, {
      name: validated.name,
      name_ar: validated.nameAr,
      short_description: validated.shortDescription,
      short_description_ar: validated.shortDescriptionAr,
      description: validated.description,
      description_ar: validated.descriptionAr,
      category_id: categoryId,
      status: validated.status,
      trial_video_url: validated.trialVideoUrl,
      duration: validated.durationMinutes,
      instructor: validated.instructor,
      slug,
    });

    await logActivity({
      ctx,
      entityType: "course",
      action: "updated",
      entityId: id,
      entityName: validated.name,
    });
  },
});

export const generateImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);

    return await ctx.storage.generateUploadUrl();
  },
});

export const updateCourseImages = mutation({
  args: {
    id: v.id("courses"),
    bannerStorageId: v.optional(v.id("_storage")),
    thumbnailStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { id, bannerStorageId, thumbnailStorageId }) => {
    await requireUser(ctx);

    const course = await ctx.db.get(id);

    if (!course || course.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Course not found.",
      });
    }

    const patch: Partial<typeof course> = {};
    let bannerImageUrl = course.banner_image_url;
    let thumbnailImageUrl = course.thumbnail_image_url;

    if (bannerStorageId) {
      const url = await ctx.storage.getUrl(bannerStorageId);

      if (!url) {
        throw new ConvexError({
          code: "STORAGE_ERROR",
          message: "Could not generate cover image URL.",
        });
      }

      patch.banner_image_url = url;
      bannerImageUrl = url;
    }

    if (thumbnailStorageId) {
      const url = await ctx.storage.getUrl(thumbnailStorageId);

      if (!url) {
        throw new ConvexError({
          code: "STORAGE_ERROR",
          message: "Could not generate thumbnail image URL.",
        });
      }

      patch.thumbnail_image_url = url;
      thumbnailImageUrl = url;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(id, patch);
    }

    return {
      bannerImageUrl,
      thumbnailImageUrl,
    };
  },
});

export const deleteCourse = mutation({
  args: {
    id: v.id("courses"),
  },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);

    const course = await ctx.db.get(id);

    if (!course || course.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Course not found.",
      });
    }

    // Check if course has any lessons
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("course_id", (q) =>
        q.eq("course_id", id).eq("deletedAt", undefined)
      )
      .collect();

    if (lessons.length > 0) {
      throw new ConvexError({
        code: "COURSE_HAS_LESSONS",
        message: "Cannot delete course that has lessons. Please delete or move all lessons first.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(id, {
      deletedAt: now,
    });

    const category = await ctx.db.get(course.category_id);

    if (category && category.deletedAt === undefined) {
      await ctx.db.patch(course.category_id, {
        course_count: Math.max(category.course_count - 1, 0),
      });
    }

    await logActivity({
      ctx,
      entityType: "course",
      action: "deleted",
      entityId: id,
      entityName: course.name,
    });
  },
});

