import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";

import {
  courseInputSchema,
  courseUpdateSchema,
  type CourseInput,
  type CourseUpdateInput,
} from "../shared/validation/course";
import { generateUniqueSlug, slugify } from "./utils/slug";
import { requireUser } from "./utils/auth";
import { logActivity } from "./utils/activityLog";
import { recalculateLessonCount } from "./lesson";

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

async function validateAdditionalCategoryIds(
  ctx: MutationCtx,
  mainCategoryId: Id<"categories">,
  rawIds: Array<Id<"categories"> | string>,
): Promise<Array<Id<"categories">>> {
  const deduped = Array.from(
    new Set(
      rawIds
        .map((id) => (typeof id === "string" ? id : id) as Id<"categories">)
        .filter((id) => id !== mainCategoryId),
    ),
  );
  const result: Array<Id<"categories">> = [];
  for (const categoryId of deduped) {
    const category = await ctx.db.get(categoryId);
    if (category && category.deletedAt === undefined) {
      result.push(categoryId);
    }
  }
  return result;
}

export const listCourses = query({
  args: {
    categoryId: v.optional(v.id("categories")),
    coachId: v.optional(v.id("coaches")),
    status: v.optional(
      v.union(v.literal("draft"), v.literal("published"), v.literal("archived"))
    ),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { categoryId, coachId, status, search, limit = 12, cursor }) => {
    await requireUser(ctx);

    const numItems = Math.min(Math.max(limit, 1), 100);

    // If search is provided, use full-text search index on name field
    if (search && search.trim().length > 0) {
      const searchTerm = search.trim();

      const queryWithSearch = ctx.db
        .query("courses")
        .withSearchIndex("search_name", (q) => {
          let query = q.search("name_search", searchTerm).eq("deletedAt", undefined);
          if (categoryId) {
            query = query.eq("category_id", categoryId);
          }
          if (coachId) {
            query = query.eq("coach_id", coachId);
          }
          if (status) {
            query = query.eq("status", status);
          }
          return query;
        });

      // Paginate search results (returned in relevance order)
      return await queryWithSearch.paginate({
        cursor: cursor ?? null,
        numItems,
      });
    }
    // When filtering by category, include courses where category is main OR in additional_category_ids
    if (categoryId !== undefined) {
      const baseQuery =
        status !== undefined
          ? ctx.db
              .query("courses")
              .withIndex("deletedAt_status", (q) =>
                q.eq("deletedAt", undefined).eq("status", status)
              )
          : ctx.db
              .query("courses")
              .withIndex("deletedAt", (q) => q.eq("deletedAt", undefined));
      const allMatching = await baseQuery.collect();
      let filtered = allMatching.filter(
        (course) =>
          course.category_id === categoryId ||
          (course.additional_category_ids ?? []).includes(categoryId)
      );
      if (coachId !== undefined) {
        filtered = filtered.filter((course) => course.coach_id === coachId);
      }
      const sorted = filtered.sort((a, b) => {
        const orderA = a.displayOrder ?? 50;
        const orderB = b.displayOrder ?? 50;
        if (orderA !== orderB) return orderA - orderB;
        const createdA = a._creationTime ?? 0;
        const createdB = b._creationTime ?? 0;
        if (createdA !== createdB) return createdA - createdB;
        return a._id.localeCompare(b._id);
      });
      const offset = Math.max(0, parseInt(cursor ?? "0", 10) || 0);
      const page = sorted.slice(offset, offset + numItems);
      const nextOffset = offset + page.length;
      return {
        page,
        isDone: nextOffset >= sorted.length,
        continueCursor:
          nextOffset < sorted.length ? String(nextOffset) : null,
      };
    }

    // When filtering by coach only, use coach_id index then filter by status and paginate
    if (coachId !== undefined) {
      const byCoach = await ctx.db
        .query("courses")
        .withIndex("coach_id", (q) =>
          q.eq("coach_id", coachId).eq("deletedAt", undefined)
        )
        .collect();
      const filtered =
        status !== undefined
          ? byCoach.filter((c) => c.status === status)
          : byCoach;
      const sorted = filtered.sort((a, b) => {
        const orderA = a.displayOrder ?? 50;
        const orderB = b.displayOrder ?? 50;
        if (orderA !== orderB) return orderA - orderB;
        const createdA = a._creationTime ?? 0;
        const createdB = b._creationTime ?? 0;
        if (createdA !== createdB) return createdA - createdB;
        return a._id.localeCompare(b._id);
      });
      const offset = Math.max(0, parseInt(cursor ?? "0", 10) || 0);
      const page = sorted.slice(offset, offset + numItems);
      const nextOffset = offset + page.length;
      return {
        page,
        isDone: nextOffset >= sorted.length,
        continueCursor:
          nextOffset < sorted.length ? String(nextOffset) : null,
      };
    }

    // No category or coach filter - use regular index queries
    let courses;

    if (status) {
      courses = await ctx.db
        .query("courses")
        .withIndex("deletedAt_status", (q) =>
          q.eq("deletedAt", undefined).eq("status", status)
        )
    } else {
      courses = await ctx.db
        .query("courses")
        .withIndex("deletedAt", (q) =>
          q.eq("deletedAt", undefined)
        )
    }

    return await courses.order("desc").paginate({
      cursor: cursor ?? null,
      numItems,
    });
  },
});

/** Category IDs that have at least one published course (main or additional). Used for filter chips. */
export const getCategoryIdsWithPublishedCourses = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const published = await ctx.db
      .query("courses")
      .withIndex("deletedAt_status", (q) =>
        q.eq("deletedAt", undefined).eq("status", "published")
      )
      .collect();
    const ids = new Set<Id<"categories">>();
    for (const course of published) {
      ids.add(course.category_id);
      for (const id of course.additional_category_ids ?? []) {
        ids.add(id);
      }
    }
    return Array.from(ids);
  },
});

/** Coach IDs that have at least one published course. Used for coach filter chips on Course card page. */
export const getCoachIdsWithPublishedCourses = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const published = await ctx.db
      .query("courses")
      .withIndex("deletedAt_status", (q) =>
        q.eq("deletedAt", undefined).eq("status", "published")
      )
      .collect();
    const ids = new Set<Id<"coaches">>();
    for (const course of published) {
      if (course.coach_id) {
        ids.add(course.coach_id);
      }
    }
    return Array.from(ids);
  },
});

export const listDeletedCourses = query({
  args: {
    categoryId: v.optional(v.id("categories")),
    status: v.optional(
      v.union(v.literal("draft"), v.literal("published"), v.literal("archived"))
    ),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { categoryId, status, search, limit = 12, cursor }) => {
    await requireUser(ctx);

    const numItems = Math.min(Math.max(limit, 1), 100);

    // Use deletedAt index with gt(0) to efficiently get all deleted courses
    // Then filter in memory for additional criteria (category, status, search)
    const deletedCourses = await ctx.db
      .query("courses")
      .withIndex("deletedAt", (q) => q.gt("deletedAt", 0))
      .collect();

    // Apply category filter
    let filtered = deletedCourses;
    if (categoryId) {
      filtered = filtered.filter((course) => course.category_id === categoryId);
    }

    // Apply status filter
    if (status) {
      filtered = filtered.filter((course) => course.status === status);
    }

    // Apply search filter (use name_search when set, else fallback to name/name_ar)
    if (search && search.trim().length > 0) {
      const searchTerm = search.trim().toLowerCase();
      filtered = filtered.filter((course) => {
        const text = course.name_search ?? [course.name, course.name_ar].filter(Boolean).join(" ");
        return text.toLowerCase().includes(searchTerm);
      });
    }

    // Sort by deletedAt descending (most recently deleted first)
    filtered.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

    // Manual pagination
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const endIndex = startIndex + numItems;
    const page = filtered.slice(startIndex, endIndex);
    const nextCursor = endIndex < filtered.length ? endIndex.toString() : null;
    const isDone = nextCursor === null;

    return {
      page,
      continueCursor: nextCursor,
      isDone,
    };
  },
});

export const createCourse = mutation({
  args: {
    name: v.string(),
    nameAr: v.string(),
    shortDescription: v.optional(v.string()),
    shortDescriptionAr: v.optional(v.string()),
    categoryId: v.id("categories"),
    coachId: v.id("coaches"),
    additionalCategoryIds: v.optional(v.array(v.id("categories"))),
  },
  handler: async (
    ctx,
    { name, nameAr, shortDescription, shortDescriptionAr, categoryId, coachId, additionalCategoryIds: rawAdditionalIds }
  ) => {
    await requireUser(ctx);

    const validated = validateCourseInput({
      name,
      nameAr,
      shortDescription,
      shortDescriptionAr,
      categoryId,
      coachId,
      additionalCategoryIds: rawAdditionalIds?.map(String) ?? [],
    });

    const category = await ctx.db.get(categoryId);

    if (!category || category.deletedAt) {
      throw new ConvexError({
        code: "INVALID_CATEGORY",
        message: "Selected category does not exist.",
      });
    }

    // Validate coach exists and is not deleted
    const coach = await ctx.db.get(coachId);
    if (!coach || coach.deletedAt) {
      throw new ConvexError({
        code: "INVALID_COACH",
        message: "Selected coach does not exist.",
      });
    }

    const additionalCategoryIds = await validateAdditionalCategoryIds(
      ctx,
      categoryId,
      rawAdditionalIds ?? [],
    );

    const duplicates = await ctx.db
      .query("courses")
      .withIndex("name", (q) => q.eq("name", validated.name))
      .collect();

    const hasDuplicate = duplicates.some(
      (item) => item.deletedAt === undefined
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

    const nameSearch = [validated.name, validated.nameAr].filter(Boolean).join(" ").trim();
    const courseId = await ctx.db.insert("courses", {
      name: validated.name,
      name_ar: validated.nameAr,
      name_search: nameSearch || undefined,
      short_description: validated.shortDescription,
      short_description_ar: validated.shortDescriptionAr,
      slug,
      category_id: categoryId,
      coach_id: coachId,
      additional_category_ids:
        additionalCategoryIds.length > 0 ? additionalCategoryIds : undefined,
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
      updatedAt: now,
    });

    // Create default chapter for the new course
    const defaultChapterId = await ctx.db.insert("chapters", {
      course_id: courseId,
      title: "Course Content",
      title_ar: "محتوى الدورة",
      displayOrder: 0,
      createdAt: now,
    });
    await ctx.db.patch(courseId, { default_chapter_id: defaultChapterId });

    // Update category course count
    await ctx.db.patch(categoryId, {
      course_count: category.course_count + 1,
    });

    // Update coach course count
    await ctx.db.patch(coachId, {
      course_count: (coach.course_count ?? 0) + 1,
      updatedAt: now,
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

/** Get the default chapter ID for a course. Used when creating lessons. */
export const getDefaultChapterForCourse = query({
  args: {
    courseId: v.id("courses"),
  },
  returns: v.union(v.id("chapters"), v.null()),
  handler: async (ctx, { courseId }) => {
    await requireUser(ctx);

    const course = await ctx.db.get(courseId);
    if (!course || course.deletedAt !== undefined) {
      return null;
    }
    return course.default_chapter_id ?? null;
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

    const pdfMaterialUrl =
      course.pdf_material_storage_id != null
        ? await ctx.storage.getUrl(course.pdf_material_storage_id)
        : null;

    return {
      ...course,
      pdfMaterialUrl,
    };
  },
});

export const updateCourse = mutation({
  args: {
    id: v.id("courses"),
    name: v.string(),
    nameAr: v.string(),
    shortDescription: v.optional(v.string()),
    shortDescriptionAr: v.optional(v.string()),
    description: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
    categoryId: v.id("categories"),
    coachId: v.id("coaches"),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived")
    ),
    trialVideoUrl: v.optional(v.string()),
    instructor: v.optional(v.string()),
    displayOrder: v.optional(v.number()),
    additionalCategoryIds: v.optional(v.array(v.id("categories"))),
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
      coachId,
      status,
      trialVideoUrl,
      instructor,
      displayOrder,
      additionalCategoryIds: rawAdditionalIds,
    }
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
      coachId,
      status,
      trialVideoUrl,
      instructor,
      displayOrder,
      additionalCategoryIds: rawAdditionalIds?.map(String) ?? [],
    });

    const additionalCategoryIds = await validateAdditionalCategoryIds(
      ctx,
      categoryId,
      rawAdditionalIds ?? [],
    );

    const targetCategory = await ctx.db.get(categoryId);

    if (!targetCategory || targetCategory.deletedAt) {
      throw new ConvexError({
        code: "INVALID_CATEGORY",
        message: "Selected category does not exist.",
      });
    }

    // Validate coach exists and is not deleted
    const targetCoach = await ctx.db.get(coachId);
    if (!targetCoach || targetCoach.deletedAt) {
      throw new ConvexError({
        code: "INVALID_COACH",
        message: "Selected coach does not exist.",
      });
    }

    const duplicates = await ctx.db
      .query("courses")
      .withIndex("name", (q) => q.eq("name", validated.name))
      .collect();

    const hasDuplicate = duplicates.some(
      (item) => item._id !== id && item.deletedAt === undefined
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
      const hasCoverImages =
        typeof course.banner_image_url === "string" &&
        course.banner_image_url.trim().length > 0 &&
        typeof course.thumbnail_image_url === "string" &&
        course.thumbnail_image_url.trim().length > 0;
      const hasTrialVideoUrl =
        validated.trialVideoUrl !== undefined &&
        validated.trialVideoUrl.trim().length > 0;

      if (!hasDescriptions || !hasCoverImages || !hasTrialVideoUrl) {
        throw new ConvexError({
          code: "COURSE_INCOMPLETE",
          message:
            "Published courses must include English and Arabic descriptions, cover images, and a trial video URL.",
        });
      }

      const publishedLessons = await ctx.db
        .query("lessons")
        .withIndex("deletedAt_course_status", (q) =>
          q
            .eq("deletedAt", undefined)
            .eq("course_id", id)
            .eq("status", "published")
        )
        .collect();

      if (publishedLessons.length === 0) {
        throw new ConvexError({
          code: "NO_PUBLISHED_LESSONS",
          message:
            "A course cannot be published until at least one lesson is published.",
        });
      }
    }

    // Check if status changed to/from "published" - recalculate duration if so
    const statusChanged = course.status !== validated.status;
    const publishedStatusChanged = statusChanged && (
      course.status === "published" || validated.status === "published"
    );

    const now = Date.now();

    // Handle category change
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

    // Handle coach change
    if (course.coach_id !== coachId) {
      // Decrement old coach's course count if there was one
      if (course.coach_id) {
        const currentCoach = await ctx.db.get(course.coach_id);
        if (currentCoach && currentCoach.deletedAt === undefined) {
          await ctx.db.patch(course.coach_id, {
            course_count: Math.max((currentCoach.course_count ?? 0) - 1, 0),
            updatedAt: now,
          });
        }
      }

      // Increment new coach's course count
      await ctx.db.patch(coachId, {
        course_count: (targetCoach.course_count ?? 0) + 1,
        updatedAt: now,
      });
    }

    const nameSearch = [validated.name, validated.nameAr].filter(Boolean).join(" ").trim();
    await ctx.db.patch(id, {
      name: validated.name,
      name_ar: validated.nameAr,
      name_search: nameSearch || undefined,
      short_description: validated.shortDescription,
      short_description_ar: validated.shortDescriptionAr,
      description: validated.description,
      description_ar: validated.descriptionAr,
      category_id: categoryId,
      coach_id: coachId,
      additional_category_ids:
        additionalCategoryIds.length > 0 ? additionalCategoryIds : undefined,
      status: validated.status,
      trial_video_url: validated.trialVideoUrl,
      instructor: validated.instructor,
      displayOrder: validated.displayOrder,
      slug,
      updatedAt: now,
    });

    // Recalculate course duration when status changes to/from "published"
    if (publishedStatusChanged) {
      await recalculateLessonCount(ctx, id);
    }

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

export const updateCoursePdfMaterial = mutation({
  args: {
    id: v.id("courses"),
    pdfStorageId: v.union(v.id("_storage"), v.null()),
    pdfMaterialName: v.optional(v.string()),
  },
  handler: async (ctx, { id, pdfStorageId, pdfMaterialName }) => {
    await requireUser(ctx);

    const course = await ctx.db.get(id);

    if (!course || course.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Course not found.",
      });
    }

    const patch: {
      pdf_material_storage_id?: Id<"_storage">;
      pdf_material_name?: string;
      pdf_material_size?: number;
      updatedAt: number;
    } = {
      updatedAt: Date.now(),
    };

    if (pdfStorageId === null) {
      patch.pdf_material_storage_id = undefined;
      patch.pdf_material_name = undefined;
      patch.pdf_material_size = undefined;
    } else {
      patch.pdf_material_storage_id = pdfStorageId;
      if (pdfMaterialName !== undefined) {
        patch.pdf_material_name = pdfMaterialName;
      }
      const storageMeta = await ctx.db.system.get(pdfStorageId);
      const size = storageMeta && "size" in storageMeta && typeof (storageMeta as { size: number }).size === "number"
        ? (storageMeta as { size: number }).size
        : undefined;
      if (size !== undefined) {
        patch.pdf_material_size = size;
      }
    }

    await ctx.db.patch(id, patch);
    return null;
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
      patch.updatedAt = Date.now();
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
        message:
          "Cannot delete course that has lessons. Please delete or move all lessons first.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(id, {
      deletedAt: now,
      updatedAt: now,
    });

    // Update category course count
    const category = await ctx.db.get(course.category_id);
    if (category && category.deletedAt === undefined) {
      await ctx.db.patch(course.category_id, {
        course_count: Math.max(category.course_count - 1, 0),
      });
    }

    // Update coach course count
    if (course.coach_id) {
      const coach = await ctx.db.get(course.coach_id);
      if (coach && coach.deletedAt === undefined) {
        await ctx.db.patch(course.coach_id, {
          course_count: Math.max((coach.course_count ?? 0) - 1, 0),
          updatedAt: now,
        });
      }
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

export const restoreCourse = mutation({
  args: {
    id: v.id("courses"),
  },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);

    const course = await ctx.db.get(id);

    if (!course || !course.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Deleted course not found.",
      });
    }

    // Check for duplicate name
    const duplicates = await ctx.db
      .query("courses")
      .withIndex("name", (q) => q.eq("name", course.name))
      .collect();

    const hasDuplicate = duplicates.some(
      (item) => item._id !== id && item.deletedAt === undefined
    );

    if (hasDuplicate) {
      throw new ConvexError({
        code: "COURSE_EXISTS",
        message: "A course with this name already exists. Cannot restore.",
      });
    }

    // Check if category still exists and is not deleted
    const category = await ctx.db.get(course.category_id);
    if (!category || category.deletedAt) {
      throw new ConvexError({
        code: "INVALID_CATEGORY",
        message: "The category for this course no longer exists. Cannot restore.",
      });
    }

    // Restore the course by removing deletedAt
    const now = Date.now();
    await ctx.db.patch(id, {
      deletedAt: undefined,
      updatedAt: now,
    });

    // Update category count
    await ctx.db.patch(course.category_id, {
      course_count: category.course_count + 1,
    });

    // Update coach count if there is a coach
    if (course.coach_id) {
      const coach = await ctx.db.get(course.coach_id);
      if (coach && coach.deletedAt === undefined) {
        await ctx.db.patch(course.coach_id, {
          course_count: (coach.course_count ?? 0) + 1,
          updatedAt: now,
        });
      }
    }

    await logActivity({
      ctx,
      entityType: "course",
      action: "updated",
      entityId: id,
      entityName: course.name,
    });
  },
});
