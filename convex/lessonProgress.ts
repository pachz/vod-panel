import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
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

export const getUserDashboardStats = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const userId = await getUserIdOrThrow(ctx);

    // Get user to find member since date
    const user = await ctx.db.get(userId);
    const memberSince = user?.emailVerificationTime ?? Date.now();

    // Get all user's lesson progress
    const allProgress = await ctx.db
      .query("lessonProgress")
      .withIndex("by_user_course_lesson", (q) => q.eq("user_id", userId))
      .collect();

    // Get unique course IDs that user has activity in
    const courseIds = [...new Set(allProgress.map((p) => p.course_id))];

    // Get all courses user has activity in
    const courses = await Promise.all(
      courseIds.map((id) => ctx.db.get(id))
    );

    // Type guard to filter out null/undefined and deleted courses
    const isValidCourse = (c: Doc<"courses"> | null): c is Doc<"courses"> => {
      return c !== null && c.deletedAt === undefined;
    };

    const validCourses = courses.filter(isValidCourse);

    // Calculate stats for each course
    let completedCourses = 0;
    let inProgressCourses = 0;
    let totalHoursWatched = 0;

    for (const course of validCourses) {
      // Get all published lessons for this course
      const publishedLessons = await ctx.db
        .query("lessons")
        .withIndex("course_id", (q) =>
          q.eq("course_id", course._id).eq("deletedAt", undefined)
        )
        .filter((q) => q.eq(q.field("status"), "published"))
        .collect();

      // Get completed lessons for this course
      const courseProgress = allProgress.filter((p) => p.course_id === course._id);
      const completedLessonIds = new Set(courseProgress.map((p) => p.lesson_id));
      const completedCount = publishedLessons.filter((l) => completedLessonIds.has(l._id)).length;

      // Calculate hours watched (sum of completed lesson durations)
      const completedLessons = publishedLessons.filter((l) => completedLessonIds.has(l._id));
      const courseHours = completedLessons.reduce((sum, lesson) => {
        return sum + (lesson.duration ?? 0);
      }, 0);
      totalHoursWatched += courseHours;

      // Check if course is completed (all published lessons completed)
      if (publishedLessons.length > 0 && completedCount === publishedLessons.length) {
        completedCourses++;
      } else if (completedCount > 0) {
        inProgressCourses++;
      }
    }

    // Convert minutes to hours
    const hoursWatched = Math.round((totalHoursWatched / 60) * 10) / 10; // Round to 1 decimal place

    return {
      coursesCompleted: completedCourses,
      coursesInProgress: inProgressCourses,
      hoursWatched,
      memberSince,
    };
  },
});

export const getUserCourses = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const userId = await getUserIdOrThrow(ctx);

    // Get all user's lesson progress
    const allProgress = await ctx.db
      .query("lessonProgress")
      .withIndex("by_user_course_lesson", (q) => q.eq("user_id", userId))
      .collect();

    // Get unique course IDs that user has activity in
    const courseIds = [...new Set(allProgress.map((p) => p.course_id))];

    // Get all courses user has activity in
    const courses = await Promise.all(
      courseIds.map((id) => ctx.db.get(id))
    );

    // Type guard to filter out null/undefined and deleted courses
    const isValidCourse = (c: Doc<"courses"> | null): c is Doc<"courses"> => {
      return c !== null && c.deletedAt === undefined;
    };

    const validCourses = courses.filter(isValidCourse);

    // Build course data with progress
    const coursesWithProgress = await Promise.all(
      validCourses.map(async (course) => {
        // Get all published lessons for this course
        const publishedLessons = await ctx.db
          .query("lessons")
          .withIndex("course_id", (q) =>
            q.eq("course_id", course._id).eq("deletedAt", undefined)
          )
          .filter((q) => q.eq(q.field("status"), "published"))
          .collect();

        // Get completed lessons for this course
        const courseProgress = allProgress.filter((p) => p.course_id === course._id);
        const completedLessonIds = new Set(courseProgress.map((p) => p.lesson_id));
        const completedCount = publishedLessons.filter((l) => completedLessonIds.has(l._id)).length;

        const totalLessons = publishedLessons.length;
        const progressPercentage = totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0;
        const isCompleted = totalLessons > 0 && completedCount === totalLessons;

        return {
          course,
          completedCount,
          totalLessons,
          progressPercentage,
          isCompleted,
          lastCompletedAt: courseProgress.length > 0
            ? Math.max(...courseProgress.map((p) => p.completedAt))
            : null,
        };
      })
    );

    // Sort by last completed date (most recent first), then by course name
    coursesWithProgress.sort((a, b) => {
      if (a.lastCompletedAt && b.lastCompletedAt) {
        return b.lastCompletedAt - a.lastCompletedAt;
      }
      if (a.lastCompletedAt) return -1;
      if (b.lastCompletedAt) return 1;
      return (a.course.name ?? "").localeCompare(b.course.name ?? "");
    });

    return coursesWithProgress;
  },
});

