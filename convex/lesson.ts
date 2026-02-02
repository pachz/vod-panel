import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
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

export const recalculateLessonCount = async (ctx: MutationCtx, courseId: Id<"courses">) => {
  const lessons = await ctx.db
    .query("lessons")
    .withIndex("course_id", (q) =>
      q.eq("course_id", courseId).eq("deletedAt", undefined)
    )
    .collect();

  const publishedLessons = lessons.filter((lesson) => lesson.status === "published");
  const count = publishedLessons.length;
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

/**
 * List all lessons for a course, ordered by priority.
 * No pagination - returns the full array. Use for course detail reordering and course preview.
 */
export const listLessonsByCourse = query({
  args: {
    courseId: v.optional(v.id("courses")),
    status: v.optional(v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    )),
  },
  returns: v.array(
    v.object({
      _id: v.id("lessons"),
      _creationTime: v.number(),
      title: v.string(),
      title_ar: v.string(),
      short_review: v.string(),
      short_review_ar: v.string(),
      description: v.optional(v.string()),
      description_ar: v.optional(v.string()),
      learning_objectives: v.optional(v.string()),
      learning_objectives_ar: v.optional(v.string()),
      course_id: v.id("courses"),
      duration: v.optional(v.number()),
      type: v.union(v.literal("video"), v.literal("article")),
      status: v.union(
        v.literal("draft"),
        v.literal("published"),
        v.literal("archived"),
      ),
      pending_status: v.optional(
        v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
      ),
      video_url: v.optional(v.string()),
      body: v.optional(v.string()),
      body_ar: v.optional(v.string()),
      cover_image_url: v.optional(v.string()),
      thumbnail_image_url: v.optional(v.string()),
      priority: v.number(),
      createdAt: v.number(),
      deletedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, { courseId, status }) => {
    await requireUser(ctx);

    if (!courseId) {
      return [];
    }

    let lessons;
    if (status) {
      lessons = await ctx.db
        .query("lessons")
        .withIndex("deletedAt_course_status", (q) =>
          q.eq("deletedAt", undefined).eq("course_id", courseId).eq("status", status),
        )
        .collect();
    } else {
      lessons = await ctx.db
        .query("lessons")
        .withIndex("course_id", (q) =>
          q.eq("course_id", courseId).eq("deletedAt", undefined),
        )
        .collect();
    }

    lessons.sort((a, b) => a.priority - b.priority);
    return lessons;
  },
});

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

export const listDeletedLessons = query({
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

    // Use deletedAt index with gt(0) to efficiently get all deleted lessons
    // Then filter in memory for additional criteria (course, status, search)
    const deletedLessons = await ctx.db
      .query("lessons")
      .withIndex("deletedAt", (q) => q.gt("deletedAt", 0))
      .collect();

    // Apply course filter
    let filtered = deletedLessons;
    if (courseId) {
      filtered = filtered.filter((lesson) => lesson.course_id === courseId);
    }

    // Apply status filter
    if (status) {
      filtered = filtered.filter((lesson) => lesson.status === status);
    }

    // Apply search filter
    if (search && search.trim().length > 0) {
      const searchTerm = search.trim().toLowerCase();
      filtered = filtered.filter(
        (lesson) =>
          lesson.title.toLowerCase().includes(searchTerm) ||
          (lesson.title_ar && lesson.title_ar.toLowerCase().includes(searchTerm))
      );
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

export const createLesson = mutation({
  args: {
    title: v.string(),
    titleAr: v.string(),
    shortReview: v.string(),
    shortReviewAr: v.string(),
    courseId: v.id("courses"),
    type: v.union(v.literal("video"), v.literal("article")),
  },
  handler: async (
    ctx,
    { title, titleAr, shortReview, shortReviewAr, courseId, type },
  ) => {
    await requireUser(ctx);

    const validated = validateLessonInput({
      title,
      titleAr,
      shortReview,
      shortReviewAr,
      courseId,
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
      duration: undefined,
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
  returns: v.union(
    v.null(),
    v.object({
      courseRevertedToDraft: v.object({ courseName: v.string() }),
    })
  ),
  handler: async (
    ctx,
    {
      id,
      title,
      titleAr,
      shortReview,
      shortReviewAr,
      courseId,
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

    let courseRevertedToDraft: { courseName: string } | null = null;

    // For video lessons missing duration: revert to draft but still allow the update.
    // We also remember the originally requested status in `pending_status` so that
    // when Vimeo returns a duration we can automatically apply it.
    let effectiveStatus = validated.status;
    let pendingStatus:
      | "draft"
      | "published"
      | "archived"
      | undefined = undefined;
    if (validated.type === "video") {
      const hasDuration = lesson.duration != null && lesson.duration >= 0;
      if (!hasDuration && validated.status === "published") {
        // Temporarily save as draft but remember the desired published status
        effectiveStatus = "draft";
        pendingStatus = "published";
      }
    }

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

    // If course changed, recalculate lesson counts for both courses
    const courseChanged = lesson.course_id !== courseId;
    const statusChanged = lesson.status !== effectiveStatus;
    // Recalculate duration if status changes to/from "published" since only published lessons count
    const publishedStatusChanged = statusChanged && (
      lesson.status === "published" || effectiveStatus === "published"
    );

    // Check if video URL changed and is from Vimeo
    const isVimeoUrl = validated.videoUrl && (
      validated.videoUrl.includes("vimeo.com") || 
      validated.videoUrl.includes("player.vimeo.com")
    );

    // Clear duration when video URL changes (old duration is for old video; Vimeo fetch will set new one)
    const videoUrlChanged = lesson.video_url !== validated.videoUrl;
    const patch: Record<string, unknown> = {
      title: validated.title,
      title_ar: validated.titleAr,
      short_review: validated.shortReview,
      short_review_ar: validated.shortReviewAr,
      description: validated.description,
      description_ar: validated.descriptionAr,
      learning_objectives: validated.learningObjectives,
      learning_objectives_ar: validated.learningObjectivesAr,
      course_id: courseId,
      type: validated.type,
      status: effectiveStatus,
      // If we had to downgrade status due to missing duration, remember the
      // requested status so we can apply it after Vimeo duration fetch.
      pending_status: pendingStatus,
      video_url: validated.type === "video" ? validated.videoUrl : undefined,
      body: validated.type === "article" ? validated.body : undefined,
      body_ar: validated.type === "article" ? validated.bodyAr : undefined,
    };
    if (validated.type === "video" && videoUrlChanged) {
      patch.duration = undefined;
    }
    await ctx.db.patch(id, patch);

    if (courseChanged) {
      const currentCourse = await ctx.db.get(lesson.course_id);

      if (currentCourse && currentCourse.deletedAt === undefined) {
        await recalculateLessonCount(ctx, lesson.course_id);
      }

      await recalculateLessonCount(ctx, courseId);
    } else if (publishedStatusChanged) {
      await recalculateLessonCount(ctx, courseId);

      // If a lesson was moved from published to draft/archived, check whether the
      // course (if published) now has zero published lessons and auto-revert to draft.
      if (lesson.status === "published" && effectiveStatus !== "published") {
        const courseAfterUpdate = await ctx.db.get(courseId);
        if (
          courseAfterUpdate &&
          courseAfterUpdate.deletedAt === undefined &&
          courseAfterUpdate.status === "published"
        ) {
          const publishedLessonsNow = await ctx.db
            .query("lessons")
            .withIndex("deletedAt_course_status", (q) =>
              q
                .eq("deletedAt", undefined)
                .eq("course_id", courseId)
                .eq("status", "published")
            )
            .collect();

          if (publishedLessonsNow.length === 0) {
            await ctx.db.patch(courseId, {
              status: "draft",
              updatedAt: Date.now(),
            });
            courseRevertedToDraft = { courseName: courseAfterUpdate.name };
          }
        }
      }
    } else {
      await touchCourseUpdatedAt(ctx, courseId, targetCourse);
    }

    // Schedule Vimeo fetch when URL changed or duration is missing (retry) - gets thumbnail and duration
    const videoUrlToFetch = validated.videoUrl;
    const shouldFetchFromVimeo =
      isVimeoUrl &&
      videoUrlToFetch &&
      (videoUrlChanged || !(lesson.duration != null && lesson.duration >= 0));
    if (shouldFetchFromVimeo && videoUrlToFetch) {
      await ctx.scheduler.runAfter(0, internal.image.fetchVimeoThumbnailAndUpdateLesson, {
        lessonId: id,
        videoUrl: videoUrlToFetch,
      });
    }

    await logActivity({
      ctx,
      entityType: "lesson",
      action: "updated",
      entityId: id,
      entityName: validated.title,
    });

    return courseRevertedToDraft !== null
      ? { courseRevertedToDraft }
      : null;
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

export const restoreLesson = mutation({
  args: {
    id: v.id("lessons"),
  },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);

    const lesson = await ctx.db.get(id);

    if (!lesson || !lesson.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Deleted lesson not found.",
      });
    }

    // Check if course still exists and is not deleted
    const course = await ctx.db.get(lesson.course_id);
    if (!course || course.deletedAt) {
      throw new ConvexError({
        code: "INVALID_COURSE",
        message: "The course for this lesson no longer exists. Cannot restore.",
      });
    }

    // Restore the lesson by removing deletedAt
    await ctx.db.patch(id, {
      deletedAt: undefined,
    });

    // Recalculate lesson count to ensure accuracy
    await recalculateLessonCount(ctx, lesson.course_id);

    await logActivity({
      ctx,
      entityType: "lesson",
      action: "updated",
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
 * Internal query: list all non-deleted video lessons that have a Vimeo video_url.
 * Used by refetchAllLessonDurationsFromVimeo to refetch durations with rate limiting.
 */
export const listAllVideoLessonsWithVimeoUrl = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      lessonId: v.id("lessons"),
      videoUrl: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();
    const result: Array<{ lessonId: Id<"lessons">; videoUrl: string }> = [];
    for (const lesson of lessons) {
      if (
        lesson.type !== "video" ||
        !lesson.video_url ||
        (!lesson.video_url.includes("vimeo.com") && !lesson.video_url.includes("player.vimeo.com"))
      ) {
        continue;
      }
      result.push({ lessonId: lesson._id, videoUrl: lesson.video_url });
    }
    return result;
  },
});

/**
 * Internal mutation to update only a lesson's duration (seconds) and recalc course counts.
 * Used by refetchAllLessonDurationsFromVimeo when refetching from Vimeo without re-downloading thumbnails.
 */
export const updateLessonDurationOnly = internalMutation({
  args: {
    lessonId: v.id("lessons"),
    duration: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { lessonId, duration }) => {
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.deletedAt) {
      return null;
    }
    await ctx.db.patch(lessonId, {
      duration,
      ...(lesson.type === "video" &&
        lesson.status === "draft" &&
        (lesson as { pending_status?: string }).pending_status === "published"
        ? { status: "published" as const, pending_status: undefined }
        : {}),
    });
    await recalculateLessonCount(ctx, lesson.course_id);
    return null;
  },
});

/**
 * Internal mutation to update lesson cover, thumbnail, and optionally duration (seconds)
 * Called by the scheduled action after fetching Vimeo thumbnail and duration
 */
export const updateLessonImageUrls = internalMutation({
  args: {
    lessonId: v.id("lessons"),
    coverImageUrl: v.string(),
    thumbnailImageUrl: v.string(),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, { lessonId, coverImageUrl, thumbnailImageUrl, duration }) => {
    const lesson = await ctx.db.get(lessonId);

    if (!lesson || lesson.deletedAt) {
      // Lesson doesn't exist or was deleted, skip update
      return;
    }

    const patch: {
      cover_image_url: string;
      thumbnail_image_url: string;
      duration?: number;
      status?: "draft" | "published" | "archived";
      pending_status?: "draft" | "published" | "archived";
    } = {
      cover_image_url: coverImageUrl,
      thumbnail_image_url: thumbnailImageUrl,
    };
    if (duration !== undefined) {
      patch.duration = duration;

      // If this is a video lesson that was temporarily saved as draft while
      // waiting for duration, and it had a pending_status of "published",
      // automatically flip it back to published now that duration is known.
      if (
        lesson.type === "video" &&
        lesson.status === "draft" &&
        (lesson as any).pending_status === "published"
      ) {
        patch.status = "published";
        patch.pending_status = undefined;
      }
    }

    await ctx.db.patch(lessonId, patch);

    if (duration !== undefined) {
      await recalculateLessonCount(ctx, lesson.course_id);
    } else {
      await touchCourseUpdatedAt(ctx, lesson.course_id);
    }
  },
});

