import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";

import { requireUser } from "./utils/auth";

// Aggregate: total watched seconds per lesson (across all users)
const lessonWatchedAggregate = new TableAggregate<
  {
    Key: Id<"lessons">;
    DataModel: DataModel;
    TableName: "lessonProgress";
  }
>(components.aggregateLessonWatched, {
  sortKey: (doc) => doc.lesson_id,
  sumValue: (doc) => doc.watchedSeconds ?? 0,
});

// Aggregate: total watched seconds per course (across all users)
const courseWatchedAggregate = new TableAggregate<
  {
    Key: Id<"courses">;
    DataModel: DataModel;
    TableName: "lessonProgress";
  }
>(components.aggregateCourseWatched, {
  sortKey: (doc) => doc.course_id,
  sumValue: (doc) => doc.watchedSeconds ?? 0,
});

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

/** Total watched hours for a single lesson (across all users). */
export const getWatchedHoursByLesson = query({
  args: { lessonId: v.id("lessons") },
  returns: v.number(),
  handler: async (ctx, { lessonId }) => {
    await requireUser(ctx);
    const totalSeconds = await lessonWatchedAggregate.sum(ctx, {
      bounds: {
        lower: { key: lessonId, inclusive: true },
        upper: { key: lessonId, inclusive: true },
      },
    });
    return Math.round((totalSeconds / 3600) * 1000) / 1000;
  },
});

/** Internal: batch watched hours for multiple courses (no auth). Used by HTTP landing. */
export const getWatchedHoursByCoursesBatch = internalQuery({
  args: { courseIds: v.array(v.id("courses")) },
  returns: v.array(v.number()),
  handler: async (ctx, { courseIds }) => {
    if (courseIds.length === 0) return [];
    const sums = await courseWatchedAggregate.sumBatch(
      ctx,
      courseIds.map((courseId) => ({
        bounds: {
          lower: { key: courseId, inclusive: true },
          upper: { key: courseId, inclusive: true },
        },
      })),
    );
    return sums.map((s) => Math.round((s / 3600) * 1000) / 1000);
  },
});

/** Total watched hours for a single course (across all users). */
export const getWatchedHoursByCourse = query({
  args: { courseId: v.id("courses") },
  returns: v.number(),
  handler: async (ctx, { courseId }) => {
    await requireUser(ctx);
    const totalSeconds = await courseWatchedAggregate.sum(ctx, {
      bounds: {
        lower: { key: courseId, inclusive: true },
        upper: { key: courseId, inclusive: true },
      },
    });
    return Math.round((totalSeconds / 3600) * 1000) / 1000;
  },
});

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

    const watchedSeconds = lesson.duration ?? 0;

    if (completed) {
      if (existing) {
        await ctx.db.patch(existing._id, {
          completedAt: Date.now(),
          watchedSeconds,
        });
        const updatedDoc = await ctx.db.get(existing._id);
        if (updatedDoc) {
          await lessonWatchedAggregate.replaceOrInsert(ctx, existing, updatedDoc);
          await courseWatchedAggregate.replaceOrInsert(ctx, existing, updatedDoc);
        }
      } else {
        const id = await ctx.db.insert("lessonProgress", {
          user_id: userId,
          course_id: courseId,
          lesson_id: lessonId,
          completedAt: Date.now(),
          watchedSeconds,
        });
        const doc = await ctx.db.get(id);
        if (doc) {
          await lessonWatchedAggregate.insert(ctx, doc);
          await courseWatchedAggregate.insert(ctx, doc);
        }
      }
    } else if (existing) {
      await lessonWatchedAggregate.delete(ctx, existing);
      await courseWatchedAggregate.delete(ctx, existing);
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

    // Get user to find registration date (member since)
    const user = await ctx.db.get(userId);
    if(!user) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found.",
      });
    }
    const memberSince = user?._creationTime;

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
    let totalSecondsWatched = 0;

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

      // Calculate seconds watched (sum of completed lesson durations; duration is stored in seconds)
      const completedLessons = publishedLessons.filter((l) => completedLessonIds.has(l._id));
      const courseSeconds = completedLessons.reduce((sum, lesson) => {
        return sum + (lesson.duration ?? 0);
      }, 0);
      totalSecondsWatched += courseSeconds;

      // Check if course is completed (all published lessons completed)
      if (publishedLessons.length > 0 && completedCount === publishedLessons.length) {
        completedCourses++;
      } else if (completedCount > 0) {
        inProgressCourses++;
      }
    }

    // Convert seconds to hours (3 decimal places so short lessons e.g. 3:18 don't round up incorrectly)
    const hoursWatched = Math.round((totalSecondsWatched / 3600) * 1000) / 1000;

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

/**
 * Backfill watchedSeconds and initialize watched-hours aggregates.
 * Run once after deploying: internal.lessonProgress.initializeWatchedHoursAggregates
 * - Patches existing lessonProgress with watchedSeconds from lesson duration
 * - Inserts all records into lesson and course aggregates
 */
export const initializeWatchedHoursAggregates = internalMutation({
  args: {},
  returns: v.object({
    patched: v.number(),
    inserted: v.number(),
    total: v.number(),
  }),
  handler: async (ctx) => {
    const allProgress = await ctx.db.query("lessonProgress").collect();
    let patched = 0;
    let inserted = 0;

    for (const progress of allProgress) {
      const lesson = await ctx.db.get(progress.lesson_id);
      const watchedSeconds = lesson?.duration ?? 0;

      if (progress.watchedSeconds === undefined) {
        await ctx.db.patch(progress._id, { watchedSeconds });
        patched++;
      }

      const doc = await ctx.db.get(progress._id);
      if (doc) {
        await lessonWatchedAggregate.insertIfDoesNotExist(ctx, doc);
        await courseWatchedAggregate.insertIfDoesNotExist(ctx, doc);
        inserted++;
      }
    }

    return { patched, inserted, total: allProgress.length };
  },
});

/**
 * Internal mutation: validates and fixes lesson progress records for all users.
 * - Removes orphan records (user, course, or lesson missing or deleted).
 * - Fixes invalid completedAt (≤ 0 or in the future) by setting to _creationTime.
 * Run via dashboard or scheduler: internal.lessonProgress.fixAllLessonProgressTimes
 */
export const fixAllLessonProgressTimes = internalMutation({
  args: {},
  returns: v.object({
    processed: v.number(),
    deletedOrphans: v.number(),
    fixedCompletedAt: v.number(),
  }),
  handler: async (ctx) => {
    let processed = 0;
    let deletedOrphans = 0;
    let fixedCompletedAt = 0;
    const now = Date.now();

    const allProgress = await ctx.db.query("lessonProgress").collect();

    for (const progress of allProgress) {
      processed += 1;

      const user = await ctx.db.get(progress.user_id);
      const course = await ctx.db.get(progress.course_id);
      const lesson = await ctx.db.get(progress.lesson_id);

      const userMissingOrDeleted = !user || user.deletedAt !== undefined;
      const courseMissingOrDeleted = !course || course.deletedAt !== undefined;
      const lessonMissingOrDeleted = !lesson || lesson.deletedAt !== undefined;

      if (userMissingOrDeleted || courseMissingOrDeleted || lessonMissingOrDeleted) {
        await ctx.db.delete(progress._id);
        deletedOrphans += 1;
        continue;
      }

      const completedAtInvalid =
        typeof progress.completedAt !== "number" ||
        progress.completedAt <= 0 ||
        progress.completedAt > now;

      if (completedAtInvalid) {
        const creationTime = progress._creationTime;
        await ctx.db.patch(progress._id, {
          completedAt: typeof creationTime === "number" && creationTime > 0 ? creationTime : now,
        });
        fixedCompletedAt += 1;
      }
    }

    return { processed, deletedOrphans, fixedCompletedAt };
  },
});

