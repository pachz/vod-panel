import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

import { requireUser } from "./utils/auth";

const getUserIdOrThrow = async (ctx: QueryCtx | MutationCtx) => {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Your session has expired. Please sign in again.",
    });
  }

  return userId as Id<"users">;
};

const emptyProgress = {
  completedLessonIds: [] as Id<"lessons">[],
  completedCount: 0,
  lastCompletedAt: null as number | null,
};

export const getCourseProgress = query({
  args: {
    courseId: v.optional(v.id("courses")),
  },
  handler: async (ctx, { courseId }) => {
    await requireUser(ctx);

    if (!courseId) {
      return emptyProgress;
    }

    const userId = await getUserIdOrThrow(ctx);

    const completions = await ctx.db
      .query("lessonProgress")
      .withIndex("by_user_course_lesson", (q) =>
        q.eq("user_id", userId).eq("course_id", courseId)
      )
      .collect();

    if (completions.length === 0) {
      return emptyProgress;
    }

    const completedLessonIds = completions.map((doc) => doc.lesson_id);

    return {
      completedLessonIds,
      completedCount: completedLessonIds.length,
      lastCompletedAt: Math.max(...completions.map((doc) => doc.completedAt)),
    };
  },
});

export const setLessonCompletion = mutation({
  args: {
    courseId: v.id("courses"),
    lessonId: v.id("lessons"),
    completed: v.boolean(),
  },
  handler: async (ctx, { courseId, lessonId, completed }) => {
    await requireUser(ctx);
    const userId = await getUserIdOrThrow(ctx);

    const lesson = await ctx.db.get(lessonId);

    if (!lesson || lesson.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Lesson not found.",
      });
    }

    if (lesson.course_id !== courseId) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Lesson does not belong to the selected course.",
      });
    }

    if (lesson.status !== "published") {
      throw new ConvexError({
        code: "LESSON_INCOMPLETE",
        message: "Only published lessons can be marked as completed.",
      });
    }

    const existing = await ctx.db
      .query("lessonProgress")
      .withIndex("by_user_course_lesson", (q) =>
        q.eq("user_id", userId).eq("course_id", courseId).eq("lesson_id", lessonId)
      )
      .unique();

    if (completed) {
      if (existing) {
        await ctx.db.patch(existing._id, { completedAt: Date.now() });
      } else {
        await ctx.db.insert("lessonProgress", {
          user_id: userId,
          course_id: courseId,
          lesson_id: lessonId,
          completedAt: Date.now(),
        });
      }
    } else if (existing) {
      await ctx.db.delete(existing._id);
    }

    const updated = await ctx.db
      .query("lessonProgress")
      .withIndex("by_user_course_lesson", (q) =>
        q.eq("user_id", userId).eq("course_id", courseId)
      )
      .collect();

    const completedLessonIds = updated.map((doc) => doc.lesson_id);

    return {
      completedLessonIds,
      completedCount: completedLessonIds.length,
    };
  },
});

