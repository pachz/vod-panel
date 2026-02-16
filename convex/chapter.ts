import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";

import { requireUser } from "./utils/auth";
import { logActivity } from "./utils/activityLog";

const DEFAULT_CHAPTER_TITLE = "Course Content";
const DEFAULT_CHAPTER_TITLE_AR = "محتوى الدورة";

/**
 * List all chapters for a course, ordered by displayOrder.
 */
export const listChaptersByCourse = query({
  args: {
    courseId: v.id("courses"),
  },
  returns: v.array(
    v.object({
      _id: v.id("chapters"),
      _creationTime: v.number(),
      course_id: v.id("courses"),
      title: v.string(),
      title_ar: v.string(),
      displayOrder: v.number(),
      createdAt: v.number(),
      deletedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, { courseId }) => {
    // No auth required: chapter list (titles/order) is safe for preview/paywall.
    // Lessons and progress remain gated by listLessonsByCourse and getCourseProgress.

    const chapters = await ctx.db
      .query("chapters")
      .withIndex("course_id", (q) =>
        q.eq("course_id", courseId).eq("deletedAt", undefined)
      )
      .collect();

    chapters.sort((a, b) => a.displayOrder - b.displayOrder);
    return chapters;
  },
});

/**
 * Create a new chapter for a course.
 */
export const createChapter = mutation({
  args: {
    courseId: v.id("courses"),
    title: v.string(),
    titleAr: v.string(),
  },
  returns: v.id("chapters"),
  handler: async (ctx, { courseId, title, titleAr }) => {
    await requireUser(ctx);

    const course = await ctx.db.get(courseId);
    if (!course || course.deletedAt !== undefined) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Course not found.",
      });
    }

    const existingChapters = await ctx.db
      .query("chapters")
      .withIndex("course_id", (q) =>
        q.eq("course_id", courseId).eq("deletedAt", undefined)
      )
      .collect();

    const maxOrder =
      existingChapters.length > 0
        ? Math.max(...existingChapters.map((c) => c.displayOrder))
        : -1;

    const now = Date.now();
    const chapterId = await ctx.db.insert("chapters", {
      course_id: courseId,
      title: title.trim() || DEFAULT_CHAPTER_TITLE,
      title_ar: titleAr.trim() || DEFAULT_CHAPTER_TITLE_AR,
      displayOrder: maxOrder + 1,
      createdAt: now,
    });

    await logActivity({
      ctx,
      entityType: "course",
      action: "updated",
      entityId: courseId,
      entityName: course.name,
    });

    return chapterId;
  },
});

/**
 * Update a chapter's title.
 */
export const updateChapter = mutation({
  args: {
    id: v.id("chapters"),
    title: v.string(),
    titleAr: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { id, title, titleAr }) => {
    await requireUser(ctx);

    const chapter = await ctx.db.get(id);
    if (!chapter || chapter.deletedAt !== undefined) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Chapter not found.",
      });
    }

    await ctx.db.patch(id, {
      title: title.trim() || DEFAULT_CHAPTER_TITLE,
      title_ar: titleAr.trim() || DEFAULT_CHAPTER_TITLE_AR,
    });

    const course = await ctx.db.get(chapter.course_id);
    if (course && course.deletedAt === undefined) {
      await logActivity({
        ctx,
        entityType: "course",
        action: "updated",
        entityId: chapter.course_id,
        entityName: course.name,
      });
    }

    return null;
  },
});

/**
 * Reorder chapters. Pass the full list of chapter IDs in the desired order.
 */
export const reorderChapters = mutation({
  args: {
    courseId: v.id("courses"),
    chapterIds: v.array(v.id("chapters")),
  },
  returns: v.null(),
  handler: async (ctx, { courseId, chapterIds }) => {
    await requireUser(ctx);

    const course = await ctx.db.get(courseId);
    if (!course || course.deletedAt !== undefined) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Course not found.",
      });
    }

    for (let i = 0; i < chapterIds.length; i++) {
      const chapter = await ctx.db.get(chapterIds[i]);
      if (!chapter || chapter.deletedAt !== undefined) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: `Chapter at index ${i} not found.`,
        });
      }
      if (chapter.course_id !== courseId) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: `Chapter at index ${i} does not belong to this course.`,
        });
      }

      await ctx.db.patch(chapterIds[i], { displayOrder: i });
    }

    await logActivity({
      ctx,
      entityType: "course",
      action: "updated",
      entityId: courseId,
      entityName: course.name,
    });

    return null;
  },
});

/**
 * Get a chapter by ID.
 */
export const getChapter = query({
  args: {
    id: v.id("chapters"),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("chapters"),
      _creationTime: v.number(),
      course_id: v.id("courses"),
      title: v.string(),
      title_ar: v.string(),
      displayOrder: v.number(),
      createdAt: v.number(),
      deletedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, { id }) => {
    await requireUser(ctx);

    const chapter = await ctx.db.get(id);
    if (!chapter || chapter.deletedAt !== undefined) {
      return null;
    }
    return chapter;
  },
});
