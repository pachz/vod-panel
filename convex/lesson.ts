import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

import {
  lessonInputSchema,
  lessonUpdateSchema,
  type LessonInput,
  type LessonUpdateInput,
} from "../shared/validation/lesson";
import { requireUser } from "./utils/auth";
import { logActivity } from "./utils/activityLog";

const touchCourseUpdatedAt = async (
  ctx: MutationCtx,
  courseId: Id<"courses">,
  course?: Doc<"courses"> | null,
) => {
  const targetCourse = course ?? (await ctx.db.get(courseId));
  if (!targetCourse || targetCourse.deletedAt !== undefined) {
    return;
  }

  await ctx.db.patch(courseId, {
    updatedAt: Date.now(),
  });
};

const recalculateLessonCount = async (ctx: MutationCtx, courseId: Id<"courses">) => {
  const lessons = await ctx.db
    .query("lessons")
    .withIndex("course_id", (q) =>
      q.eq("course_id", courseId).eq("deletedAt", undefined)
    )
    .collect();

  const count = lessons.length;
  // Only include published lessons when calculating total duration
  const publishedLessons = lessons.filter((lesson) => lesson.status === "published");
  const totalDuration = publishedLessons.reduce((sum, lesson) => sum + (lesson.duration ?? 0), 0);

  await ctx.db.patch(courseId, {
    lesson_count: count,
    duration: totalDuration > 0 ? totalDuration : undefined,
    updatedAt: Date.now(),
  });

  return {
    count,
    totalDuration,
  };
};

const validateLessonInput = (input: LessonInput) => {
  const result = lessonInputSchema.safeParse(input);

  if (!result.success) {
    const issue = result.error.errors[0];
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: issue?.message ?? "Invalid lesson input.",
    });
  }

  return result.data;
};

const validateLessonUpdateInput = (input: LessonUpdateInput) => {
  const result = lessonUpdateSchema.safeParse(input);

  if (!result.success) {
    const issue = result.error.errors[0];
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: issue?.message ?? "Invalid lesson input.",
    });
  }

  return result.data;
};

export const listLessons = query({
  args: {
    courseId: v.optional(v.id("courses")),
    status: v.optional(v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    )),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { courseId, status, search, limit = 12, cursor }) => {
    await requireUser(ctx);

    const numItems = Math.min(Math.max(limit, 1), 100);

    // If search is provided, use full-text search index on title field
    if (search && search.trim().length > 0) {
      const searchTerm = search.trim();
      
      const queryWithSearch = ctx.db
        .query("lessons")
        .withSearchIndex("search_title", (q) => {
          let query = q.search("title", searchTerm).eq("deletedAt", undefined);
          if (courseId) {
            query = query.eq("course_id", courseId);
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

    // No search - use regular index queries
    let lessons;

    if (courseId && status) {
      // Case 3: Both filters - use all 3 fields
      lessons = ctx.db
        .query("lessons")
        .withIndex("deletedAt_course_status", (q) =>
          q.eq("deletedAt", undefined).eq("course_id", courseId).eq("status", status)
        );
    } else if (courseId) {
      // Case 2: Course only - use first 2 fields
      lessons = ctx.db
        .query("lessons")
        .withIndex("deletedAt_course_status", (q) =>
          q.eq("deletedAt", undefined).eq("course_id", courseId)
        );
    } else if (status) {
      // Status only - use deletedAt_status index
      lessons = ctx.db
        .query("lessons")
        .withIndex("deletedAt_status", (q) =>
          q.eq("deletedAt", undefined).eq("status", status)
        );
    } else {
      // Case 1: No filters - use only deletedAt
      lessons = ctx.db
        .query("lessons")
        .withIndex("deletedAt", (q) =>
          q.eq("deletedAt", undefined)
        );
    }

    return await lessons.order("desc").paginate({
      cursor: cursor ?? null,
      numItems,
    });
  },
});

export const createLesson = mutation({
  args: {
    title: v.string(),
    titleAr: v.string(),
    shortReview: v.string(),
    shortReviewAr: v.string(),
    courseId: v.id("courses"),
    duration: v.optional(v.number()),
    type: v.union(v.literal("video"), v.literal("article")),
  },
  handler: async (
    ctx,
    { title, titleAr, shortReview, shortReviewAr, courseId, duration, type },
  ) => {
    await requireUser(ctx);

    const validated = validateLessonInput({
      title,
      titleAr,
      shortReview,
      shortReviewAr,
      courseId,
      duration,
      type,
    });

    const course = await ctx.db.get(courseId);

    if (!course || course.deletedAt) {
      throw new ConvexError({
        code: "INVALID_COURSE",
        message: "Selected course does not exist.",
      });
    }

    // Get the highest priority for this course to add new lesson at the end
    const existingLessons = await ctx.db
      .query("lessons")
      .withIndex("course_id", (q) =>
        q.eq("course_id", courseId).eq("deletedAt", undefined)
      )
      .collect();
    
    const maxPriority = existingLessons.length > 0
      ? Math.max(...existingLessons.map(l => l.priority))
      : -1;

    const now = Date.now();

    const lessonId = await ctx.db.insert("lessons", {
      title: validated.title,
      title_ar: validated.titleAr,
      short_review: validated.shortReview,
      short_review_ar: validated.shortReviewAr,
      course_id: courseId,
      duration: validated.duration,
      type: validated.type,
      status: "draft",
      priority: maxPriority + 1,
      createdAt: now,
      video_url: undefined,
      body: undefined,
      body_ar: undefined,
    });

    // Recalculate course lesson count to ensure accuracy
    await recalculateLessonCount(ctx, courseId);

    await logActivity({
      ctx,
      entityType: "lesson",
      action: "created",
      entityId: lessonId,
      entityName: validated.title,
    });

    return lessonId;
  },
});

export const getLesson = query({
  args: {
    id: v.id("lessons"),
  },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);

    const lesson = await ctx.db.get(id);

    if (!lesson || lesson.deletedAt) {
      return null;
    }

    return lesson;
  },
});

export const updateLesson = mutation({
  args: {
    id: v.id("lessons"),
    title: v.string(),
    titleAr: v.string(),
    shortReview: v.string(),
    shortReviewAr: v.string(),
    courseId: v.id("courses"),
    duration: v.optional(v.number()),
    type: v.union(v.literal("video"), v.literal("article")),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),
    videoUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
    learningObjectives: v.optional(v.string()),
    learningObjectivesAr: v.optional(v.string()),
    body: v.optional(v.string()),
    bodyAr: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      id,
      title,
      titleAr,
      shortReview,
      shortReviewAr,
      courseId,
      duration,
      type,
      status,
      videoUrl,
      description,
      descriptionAr,
      learningObjectives,
      learningObjectivesAr,
      body,
      bodyAr,
    },
  ) => {
    await requireUser(ctx);

    const lesson = await ctx.db.get(id);

    if (!lesson || lesson.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Lesson not found.",
      });
    }

    const validated = validateLessonUpdateInput({
      title,
      titleAr,
      shortReview,
      shortReviewAr,
      courseId,
      duration,
      type,
      status,
      videoUrl,
      description,
      descriptionAr,
      learningObjectives,
      learningObjectivesAr,
      body,
      bodyAr,
    });

    const targetCourse = await ctx.db.get(courseId);

    if (!targetCourse || targetCourse.deletedAt) {
      throw new ConvexError({
        code: "INVALID_COURSE",
        message: "Selected course does not exist.",
      });
    }

    // If course changed, recalculate lesson counts for both courses
    const courseChanged = lesson.course_id !== courseId;
    const durationChanged = (lesson.duration ?? null) !== (validated.duration ?? null);

    // Validate type-specific fields
    if (validated.type === "video" && !validated.videoUrl) {
      if (validated.status === "published") {
        throw new ConvexError({
          code: "LESSON_INCOMPLETE",
          message: "Published video lessons must include a video URL.",
        });
      }
    }

    if (validated.type === "article" && (!validated.body || !validated.bodyAr)) {
      if (validated.status === "published") {
        throw new ConvexError({
          code: "LESSON_INCOMPLETE",
          message: "Published article lessons must include English and Arabic body content.",
        });
      }
    }

    // Check if video URL changed and is from Vimeo
    const videoUrlChanged = lesson.video_url !== validated.videoUrl;
    const isVimeoUrl = validated.videoUrl && (
      validated.videoUrl.includes("vimeo.com") || 
      validated.videoUrl.includes("player.vimeo.com")
    );

    await ctx.db.patch(id, {
      title: validated.title,
      title_ar: validated.titleAr,
      short_review: validated.shortReview,
      short_review_ar: validated.shortReviewAr,
      description: validated.description,
      description_ar: validated.descriptionAr,
      learning_objectives: validated.learningObjectives,
      learning_objectives_ar: validated.learningObjectivesAr,
      course_id: courseId,
      duration: validated.duration,
      type: validated.type,
      status: validated.status,
      video_url: validated.type === "video" ? validated.videoUrl : undefined,
      body: validated.type === "article" ? validated.body : undefined,
      body_ar: validated.type === "article" ? validated.bodyAr : undefined,
    });

    if (courseChanged) {
      const currentCourse = await ctx.db.get(lesson.course_id);

      if (currentCourse && currentCourse.deletedAt === undefined) {
        await recalculateLessonCount(ctx, lesson.course_id);
      }

      await recalculateLessonCount(ctx, courseId);
    } else if (durationChanged) {
      await recalculateLessonCount(ctx, courseId);
    } else {
      await touchCourseUpdatedAt(ctx, courseId, targetCourse);
    }

    // Schedule thumbnail fetch if video URL changed and is from Vimeo
    if (videoUrlChanged && isVimeoUrl && validated.videoUrl) {
      await ctx.scheduler.runAfter(0, internal.image.fetchVimeoThumbnailAndUpdateLesson, {
        lessonId: id,
        videoUrl: validated.videoUrl,
      });
    }

    await logActivity({
      ctx,
      entityType: "lesson",
      action: "updated",
      entityId: id,
      entityName: validated.title,
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

export const updateLessonImages = mutation({
  args: {
    id: v.id("lessons"),
    coverStorageId: v.optional(v.id("_storage")),
    thumbnailStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { id, coverStorageId, thumbnailStorageId }) => {
    await requireUser(ctx);

    const lesson = await ctx.db.get(id);

    if (!lesson || lesson.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Lesson not found.",
      });
    }

    const patch: Partial<typeof lesson> = {};
    let coverImageUrl = lesson.cover_image_url;
    let thumbnailImageUrl = lesson.thumbnail_image_url;

    if (coverStorageId) {
      const url = await ctx.storage.getUrl(coverStorageId);

      if (!url) {
        throw new ConvexError({
          code: "STORAGE_ERROR",
          message: "Could not generate cover image URL.",
        });
      }

      patch.cover_image_url = url;
      coverImageUrl = url;
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
      await touchCourseUpdatedAt(ctx, lesson.course_id);
    }

    return {
      coverImageUrl,
      thumbnailImageUrl,
    };
  },
});

export const deleteLesson = mutation({
  args: {
    id: v.id("lessons"),
  },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);

    const lesson = await ctx.db.get(id);

    if (!lesson || lesson.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Lesson not found.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(id, {
      deletedAt: now,
    });

    const course = await ctx.db.get(lesson.course_id);

    if (course && course.deletedAt === undefined) {
      // Recalculate lesson count to ensure accuracy
      await recalculateLessonCount(ctx, lesson.course_id);
    }

    await logActivity({
      ctx,
      entityType: "lesson",
      action: "deleted",
      entityId: id,
      entityName: lesson.title,
    });
  },
});

export const reorderLessons = mutation({
  args: {
    courseId: v.id("courses"),
    lessonIds: v.array(v.id("lessons")),
  },
  handler: async (ctx, { courseId, lessonIds }) => {
    await requireUser(ctx);

    const course = await ctx.db.get(courseId);

    if (!course || course.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Course not found.",
      });
    }

    // Verify all lessons belong to this course and exist
    const lessons = await Promise.all(
      lessonIds.map((id) => ctx.db.get(id))
    );

    for (let i = 0; i < lessons.length; i++) {
      const lesson = lessons[i];
      if (!lesson || lesson.deletedAt) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: `Lesson at index ${i} not found.`,
        });
      }
      if (lesson.course_id !== courseId) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: `Lesson at index ${i} does not belong to this course.`,
        });
      }
    }

    // Update priorities based on the new order
    // Priority starts at 0 and increments by 1
    for (let i = 0; i < lessonIds.length; i++) {
      await ctx.db.patch(lessonIds[i], {
        priority: i,
      });
    }

    await touchCourseUpdatedAt(ctx, courseId, course);
  },
});

/**
 * Internal mutation to update lesson cover and thumbnail image URLs
 * Called by the scheduled action after fetching Vimeo thumbnail
 */
export const updateLessonImageUrls = internalMutation({
  args: {
    lessonId: v.id("lessons"),
    coverImageUrl: v.string(),
    thumbnailImageUrl: v.string(),
  },
  handler: async (ctx, { lessonId, coverImageUrl, thumbnailImageUrl }) => {
    const lesson = await ctx.db.get(lessonId);

    if (!lesson || lesson.deletedAt) {
      // Lesson doesn't exist or was deleted, skip update
      return;
    }

    await ctx.db.patch(lessonId, {
      cover_image_url: coverImageUrl,
      thumbnail_image_url: thumbnailImageUrl,
    });

    await touchCourseUpdatedAt(ctx, lesson.course_id);
  },
});

