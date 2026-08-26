import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./utils/auth";
import {
  MAX_CONTENT_ANALYTICS_RANGE_DAYS,
  enumerateUtcDayKeys,
  parseUtcDayKey,
  periodKeysAt,
  previousUtcPeriod,
  utcDayKey,
  viewCountsValidator,
  viewGranularityValidator,
  type ViewCounts,
  type ViewGranularity,
} from "./lib/viewPeriodKeys";

const entityTypeValidator = v.union(v.literal("lesson"), v.literal("course"));
const metricValidator = v.union(v.literal("views"), v.literal("watchedSeconds"));

type LessonBucketTable = "lessonViewBuckets" | "lessonWatchBuckets";
type CourseBucketTable = "courseViewBuckets" | "courseWatchBuckets";

async function getUserIdOrThrow(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Your session has expired. Please sign in again.",
    });
  }
  return userId as Id<"users">;
}

async function adjustLessonBucket(
  ctx: MutationCtx,
  table: LessonBucketTable,
  lessonId: Id<"lessons">,
  courseId: Id<"courses">,
  granularity: ViewGranularity,
  periodKey: string,
  delta: number,
  now: number,
): Promise<number> {
  if (delta === 0) return 0;

  const existing = await ctx.db
    .query(table)
    .withIndex("by_entity_granularity_period", (q) =>
      q
        .eq("lesson_id", lessonId)
        .eq("granularity", granularity)
        .eq("periodKey", periodKey),
    )
    .unique();

  if (existing) {
    const next = Math.max(0, existing.count + delta);
    if (next === 0) {
      await ctx.db.delete(existing._id);
      return 0;
    }
    await ctx.db.patch(existing._id, { count: next, updatedAt: now });
    return next;
  }

  if (delta < 0) return 0;

  await ctx.db.insert(table, {
    lesson_id: lessonId,
    course_id: courseId,
    granularity,
    periodKey,
    count: delta,
    updatedAt: now,
  });
  return delta;
}

async function adjustCourseBucket(
  ctx: MutationCtx,
  table: CourseBucketTable,
  courseId: Id<"courses">,
  granularity: ViewGranularity,
  periodKey: string,
  delta: number,
  now: number,
): Promise<number> {
  if (delta === 0) return 0;

  const existing = await ctx.db
    .query(table)
    .withIndex("by_entity_granularity_period", (q) =>
      q
        .eq("course_id", courseId)
        .eq("granularity", granularity)
        .eq("periodKey", periodKey),
    )
    .unique();

  if (existing) {
    const next = Math.max(0, existing.count + delta);
    if (next === 0) {
      await ctx.db.delete(existing._id);
      return 0;
    }
    await ctx.db.patch(existing._id, { count: next, updatedAt: now });
    return next;
  }

  if (delta < 0) return 0;

  await ctx.db.insert(table, {
    course_id: courseId,
    granularity,
    periodKey,
    count: delta,
    updatedAt: now,
  });
  return delta;
}

/** Increment/decrement lesson + course view or watch buckets for all period keys at `atMs`. */
export async function adjustContentBucketsAt(
  ctx: MutationCtx,
  args: {
    metric: "views" | "watchedSeconds";
    lessonId: Id<"lessons">;
    courseId: Id<"courses">;
    delta: number;
    atMs: number;
  },
): Promise<void> {
  const { metric, lessonId, courseId, delta, atMs } = args;
  if (delta === 0) return;

  const lessonTable: LessonBucketTable =
    metric === "views" ? "lessonViewBuckets" : "lessonWatchBuckets";
  const courseTable: CourseBucketTable =
    metric === "views" ? "courseViewBuckets" : "courseWatchBuckets";
  const now = Date.now();
  const keys = periodKeysAt(atMs);

  for (const { granularity, periodKey } of keys) {
    await adjustLessonBucket(
      ctx,
      lessonTable,
      lessonId,
      courseId,
      granularity,
      periodKey,
      delta,
      now,
    );
    await adjustCourseBucket(
      ctx,
      courseTable,
      courseId,
      granularity,
      periodKey,
      delta,
      now,
    );
  }
}

async function readLessonBucket(
  ctx: QueryCtx | MutationCtx,
  table: LessonBucketTable,
  lessonId: Id<"lessons">,
  granularity: ViewGranularity,
  periodKey: string,
): Promise<number> {
  const row = await ctx.db
    .query(table)
    .withIndex("by_entity_granularity_period", (q) =>
      q
        .eq("lesson_id", lessonId)
        .eq("granularity", granularity)
        .eq("periodKey", periodKey),
    )
    .unique();
  return row?.count ?? 0;
}

async function readCourseBucket(
  ctx: QueryCtx | MutationCtx,
  table: CourseBucketTable,
  courseId: Id<"courses">,
  granularity: ViewGranularity,
  periodKey: string,
): Promise<number> {
  const row = await ctx.db
    .query(table)
    .withIndex("by_entity_granularity_period", (q) =>
      q
        .eq("course_id", courseId)
        .eq("granularity", granularity)
        .eq("periodKey", periodKey),
    )
    .unique();
  return row?.count ?? 0;
}

async function getEntityCounts(
  ctx: QueryCtx | MutationCtx,
  args: {
    entityType: "lesson" | "course";
    entityId: Id<"lessons"> | Id<"courses">;
    metric: "views" | "watchedSeconds";
    atMs: number;
  },
): Promise<ViewCounts> {
  const keys = periodKeysAt(args.atMs);
  const values = await Promise.all(
    keys.map(({ granularity, periodKey }) => {
      if (args.entityType === "lesson") {
        const table: LessonBucketTable =
          args.metric === "views" ? "lessonViewBuckets" : "lessonWatchBuckets";
        return readLessonBucket(
          ctx,
          table,
          args.entityId as Id<"lessons">,
          granularity,
          periodKey,
        );
      }
      const table: CourseBucketTable =
        args.metric === "views" ? "courseViewBuckets" : "courseWatchBuckets";
      return readCourseBucket(
        ctx,
        table,
        args.entityId as Id<"courses">,
        granularity,
        periodKey,
      );
    }),
  );

  return {
    total: values[0] ?? 0,
    day: values[1] ?? 0,
    week: values[2] ?? 0,
    month: values[3] ?? 0,
  };
}

/**
 * Record a lesson view (once per user per lesson per UTC day).
 * Also increments parent course view buckets.
 */
export const recordLessonView = mutation({
  args: {
    courseId: v.id("courses"),
    lessonId: v.id("lessons"),
  },
  returns: v.object({
    counted: v.boolean(),
    dayKey: v.string(),
  }),
  handler: async (ctx, { courseId, lessonId }) => {
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
        code: "INVALID_INPUT",
        message: "Only published lessons can be viewed.",
      });
    }

    const course = await ctx.db.get(courseId);
    if (!course || course.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Course not found.",
      });
    }

    const now = Date.now();
    const dayKey = utcDayKey(now);

    const existingDedup = await ctx.db
      .query("lessonViewDedup")
      .withIndex("by_user_lesson_day", (q) =>
        q.eq("user_id", userId).eq("lesson_id", lessonId).eq("dayKey", dayKey),
      )
      .unique();

    if (existingDedup) {
      return { counted: false, dayKey };
    }

    await ctx.db.insert("lessonViewDedup", {
      user_id: userId,
      lesson_id: lessonId,
      dayKey,
      createdAt: now,
    });

    await adjustContentBucketsAt(ctx, {
      metric: "views",
      lessonId,
      courseId,
      delta: 1,
      atMs: now,
    });

    return { counted: true, dayKey };
  },
});

export const getContentViewCounts = query({
  args: {
    entityType: entityTypeValidator,
    entityId: v.string(),
    atMs: v.number(),
  },
  returns: viewCountsValidator,
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });

    if (args.entityType === "lesson") {
      return await getEntityCounts(ctx, {
        entityType: "lesson",
        entityId: args.entityId as Id<"lessons">,
        metric: "views",
        atMs: args.atMs,
      });
    }
    return await getEntityCounts(ctx, {
      entityType: "course",
      entityId: args.entityId as Id<"courses">,
      metric: "views",
      atMs: args.atMs,
    });
  },
});

export const getContentWatchCounts = query({
  args: {
    entityType: entityTypeValidator,
    entityId: v.string(),
    atMs: v.number(),
  },
  returns: viewCountsValidator,
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });

    if (args.entityType === "lesson") {
      return await getEntityCounts(ctx, {
        entityType: "lesson",
        entityId: args.entityId as Id<"lessons">,
        metric: "watchedSeconds",
        atMs: args.atMs,
      });
    }
    return await getEntityCounts(ctx, {
      entityType: "course",
      entityId: args.entityId as Id<"courses">,
      metric: "watchedSeconds",
      atMs: args.atMs,
    });
  },
});

const topContentItemValidator = v.object({
  entityId: v.string(),
  courseId: v.optional(v.string()),
  count: v.number(),
});

async function getTopByMetric(
  ctx: QueryCtx,
  args: {
    entityType: "lesson" | "course";
    metric: "views" | "watchedSeconds";
    granularity: ViewGranularity;
    periodKey: string;
    limit: number;
  },
): Promise<Array<{ entityId: string; courseId?: string; count: number }>> {
  const limit = Math.min(Math.max(args.limit, 1), 100);

  if (args.entityType === "lesson") {
    const table: LessonBucketTable =
      args.metric === "views" ? "lessonViewBuckets" : "lessonWatchBuckets";
    const rows = await ctx.db
      .query(table)
      .withIndex("by_granularity_period_count", (q) =>
        q.eq("granularity", args.granularity).eq("periodKey", args.periodKey),
      )
      .order("desc")
      .take(limit);

    return rows.map((row) => ({
      entityId: row.lesson_id as string,
      courseId: row.course_id as string,
      count: row.count,
    }));
  }

  const table: CourseBucketTable =
    args.metric === "views" ? "courseViewBuckets" : "courseWatchBuckets";
  const rows = await ctx.db
    .query(table)
    .withIndex("by_granularity_period_count", (q) =>
      q.eq("granularity", args.granularity).eq("periodKey", args.periodKey),
    )
    .order("desc")
    .take(limit);

  return rows.map((row) => ({
    entityId: row.course_id as string,
    count: row.count,
  }));
}

export const getTopContentByViews = query({
  args: {
    entityType: entityTypeValidator,
    granularity: viewGranularityValidator,
    periodKey: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(topContentItemValidator),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });
    return await getTopByMetric(ctx, {
      entityType: args.entityType,
      metric: "views",
      granularity: args.granularity,
      periodKey: args.periodKey,
      limit: args.limit ?? 10,
    });
  },
});

export const getTopContentByWatchedHours = query({
  args: {
    entityType: entityTypeValidator,
    granularity: viewGranularityValidator,
    periodKey: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      entityId: v.string(),
      courseId: v.optional(v.string()),
      watchedSeconds: v.number(),
      watchedHours: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const rows = await getTopByMetric(ctx, {
      entityType: args.entityType,
      metric: "watchedSeconds",
      granularity: args.granularity,
      periodKey: args.periodKey,
      limit: args.limit ?? 10,
    });
    return rows.map((row) => ({
      entityId: row.entityId,
      courseId: row.courseId,
      watchedSeconds: row.count,
      watchedHours: Math.round((row.count / 3600) * 1000) / 1000,
    }));
  },
});

export const getContentDailySeries = query({
  args: {
    entityType: entityTypeValidator,
    entityId: v.string(),
    metric: metricValidator,
    startDay: v.string(),
    endDay: v.string(),
  },
  returns: v.array(
    v.object({
      dayKey: v.string(),
      count: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });

    if (args.startDay > args.endDay) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "startDay must be <= endDay.",
      });
    }

    if (args.entityType === "lesson") {
      const table: LessonBucketTable =
        args.metric === "views" ? "lessonViewBuckets" : "lessonWatchBuckets";
      const rows = await ctx.db
        .query(table)
        .withIndex("by_entity_granularity_period", (q) =>
          q
            .eq("lesson_id", args.entityId as Id<"lessons">)
            .eq("granularity", "day")
            .gte("periodKey", args.startDay)
            .lte("periodKey", args.endDay),
        )
        .take(400);

      return rows
        .map((row) => ({ dayKey: row.periodKey, count: row.count }))
        .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
    }

    const table: CourseBucketTable =
      args.metric === "views" ? "courseViewBuckets" : "courseWatchBuckets";
    const rows = await ctx.db
      .query(table)
      .withIndex("by_entity_granularity_period", (q) =>
        q
          .eq("course_id", args.entityId as Id<"courses">)
          .eq("granularity", "day")
          .gte("periodKey", args.startDay)
          .lte("periodKey", args.endDay),
      )
      .take(400);

    return rows
      .map((row) => ({ dayKey: row.periodKey, count: row.count }))
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  },
});

export const comparePeriods = query({
  args: {
    entityType: entityTypeValidator,
    entityId: v.string(),
    metric: metricValidator,
    granularity: viewGranularityValidator,
    periodKeyA: v.string(),
    periodKeyB: v.string(),
  },
  returns: v.object({
    periodKeyA: v.string(),
    periodKeyB: v.string(),
    countA: v.number(),
    countB: v.number(),
    delta: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });

    let countA = 0;
    let countB = 0;

    if (args.entityType === "lesson") {
      const table: LessonBucketTable =
        args.metric === "views" ? "lessonViewBuckets" : "lessonWatchBuckets";
      const lessonId = args.entityId as Id<"lessons">;
      countA = await readLessonBucket(
        ctx,
        table,
        lessonId,
        args.granularity,
        args.periodKeyA,
      );
      countB = await readLessonBucket(
        ctx,
        table,
        lessonId,
        args.granularity,
        args.periodKeyB,
      );
    } else {
      const table: CourseBucketTable =
        args.metric === "views" ? "courseViewBuckets" : "courseWatchBuckets";
      const courseId = args.entityId as Id<"courses">;
      countA = await readCourseBucket(
        ctx,
        table,
        courseId,
        args.granularity,
        args.periodKeyA,
      );
      countB = await readCourseBucket(
        ctx,
        table,
        courseId,
        args.granularity,
        args.periodKeyB,
      );
    }

    return {
      periodKeyA: args.periodKeyA,
      periodKeyB: args.periodKeyB,
      countA,
      countB,
      delta: countB - countA,
    };
  },
});

const rankedItemValidator = v.object({
  id: v.string(),
  name: v.string(),
  count: v.number(),
  percentage: v.number(),
  courseId: v.optional(v.string()),
  courseName: v.optional(v.string()),
});

async function sumCourseMetricForDays(
  ctx: QueryCtx,
  table: CourseBucketTable,
  dayKeys: string[],
): Promise<{
  total: number;
  byDay: Array<{ date: string; count: number }>;
  byEntity: Map<Id<"courses">, number>;
}> {
  const byEntity = new Map<Id<"courses">, number>();
  const byDay: Array<{ date: string; count: number }> = [];
  let total = 0;

  for (const dayKey of dayKeys) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_granularity_period_count", (q) =>
        q.eq("granularity", "day").eq("periodKey", dayKey),
      )
      .take(500);

    let dayTotal = 0;
    for (const row of rows) {
      dayTotal += row.count;
      byEntity.set(row.course_id, (byEntity.get(row.course_id) ?? 0) + row.count);
    }
    total += dayTotal;
    byDay.push({ date: dayKey, count: dayTotal });
  }

  return { total, byDay, byEntity };
}

async function sumLessonMetricForDays(
  ctx: QueryCtx,
  table: LessonBucketTable,
  dayKeys: string[],
): Promise<Map<Id<"lessons">, { count: number; courseId: Id<"courses"> }>> {
  const byEntity = new Map<
    Id<"lessons">,
    { count: number; courseId: Id<"courses"> }
  >();

  for (const dayKey of dayKeys) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_granularity_period_count", (q) =>
        q.eq("granularity", "day").eq("periodKey", dayKey),
      )
      .take(500);

    for (const row of rows) {
      const existing = byEntity.get(row.lesson_id);
      if (existing) {
        existing.count += row.count;
      } else {
        byEntity.set(row.lesson_id, {
          count: row.count,
          courseId: row.course_id,
        });
      }
    }
  }

  return byEntity;
}

function topEntries<T>(
  entries: Array<{ key: T; count: number }>,
  limit: number,
): Array<{ key: T; count: number }> {
  return entries
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Dashboard analytics for course/lesson views and watched seconds over a UTC date range.
 */
export const getContentEngagementDashboard = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  returns: v.object({
    startDate: v.string(),
    endDate: v.string(),
    totalViews: v.number(),
    totalWatchedSeconds: v.number(),
    totalWatchedHours: v.number(),
    viewsChangePercent: v.number(),
    previousPeriod: v.object({
      startDate: v.string(),
      endDate: v.string(),
      totalViews: v.number(),
    }),
    viewsByDay: v.array(
      v.object({
        date: v.string(),
        views: v.number(),
      }),
    ),
    topCoursesByViews: v.array(rankedItemValidator),
    topLessonsByViews: v.array(rankedItemValidator),
    topCoursesByWatched: v.array(rankedItemValidator),
    topCourse: v.union(
      v.null(),
      v.object({
        id: v.string(),
        name: v.string(),
        views: v.number(),
      }),
    ),
    topLesson: v.union(
      v.null(),
      v.object({
        id: v.string(),
        name: v.string(),
        views: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });

    const startDate = parseUtcDayKey(args.startDate);
    const endDate = parseUtcDayKey(args.endDate);
    if (!startDate || !endDate) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Dates must be YYYY-MM-DD.",
      });
    }
    if (startDate > endDate) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Start date must be on or before end date.",
      });
    }

    const dayKeys = enumerateUtcDayKeys(startDate, endDate);
    if (dayKeys.length > MAX_CONTENT_ANALYTICS_RANGE_DAYS) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: `Date range must be at most ${MAX_CONTENT_ANALYTICS_RANGE_DAYS} days.`,
      });
    }

    const previous = previousUtcPeriod(startDate, endDate);
    const previousDayKeys = enumerateUtcDayKeys(
      previous.startDay,
      previous.endDay,
    );

    const [courseViews, courseWatch, lessonViews, previousCourseViews] =
      await Promise.all([
        sumCourseMetricForDays(ctx, "courseViewBuckets", dayKeys),
        sumCourseMetricForDays(ctx, "courseWatchBuckets", dayKeys),
        sumLessonMetricForDays(ctx, "lessonViewBuckets", dayKeys),
        sumCourseMetricForDays(ctx, "courseViewBuckets", previousDayKeys),
      ]);

    const totalViews = courseViews.total;
    const totalWatchedSeconds = courseWatch.total;
    const previousTotalViews = previousCourseViews.total;
    const viewsChangePercent =
      previousTotalViews === 0
        ? totalViews > 0
          ? 100
          : 0
        : Math.round(
            ((totalViews - previousTotalViews) / previousTotalViews) * 1000,
          ) / 10;

    const topCourseEntries = topEntries(
      [...courseViews.byEntity.entries()].map(([key, count]) => ({
        key,
        count,
      })),
      8,
    );
    const topLessonEntries = topEntries(
      [...lessonViews.entries()].map(([key, value]) => ({
        key,
        count: value.count,
      })),
      8,
    );
    const topWatchCourseEntries = topEntries(
      [...courseWatch.byEntity.entries()].map(([key, count]) => ({
        key,
        count,
      })),
      8,
    );

    const courseIdsNeeded = new Set<Id<"courses">>();
    for (const entry of topCourseEntries) courseIdsNeeded.add(entry.key);
    for (const entry of topWatchCourseEntries) courseIdsNeeded.add(entry.key);
    for (const [, value] of lessonViews) courseIdsNeeded.add(value.courseId);

    const courseNameById = new Map<Id<"courses">, string>();
    await Promise.all(
      [...courseIdsNeeded].map(async (courseId) => {
        const course = await ctx.db.get(courseId);
        if (course) {
          courseNameById.set(courseId, course.name);
        }
      }),
    );

    const lessonNameById = new Map<Id<"lessons">, string>();
    await Promise.all(
      topLessonEntries.map(async ({ key }) => {
        const lesson = await ctx.db.get(key);
        if (lesson) {
          lessonNameById.set(key, lesson.title);
        }
      }),
    );

    const toPercent = (count: number, total: number) =>
      total > 0 ? Math.round((count / total) * 1000) / 10 : 0;

    const topCoursesByViews = topCourseEntries.map(({ key, count }) => ({
      id: key as string,
      name: courseNameById.get(key) ?? "Unknown course",
      count,
      percentage: toPercent(count, totalViews),
    }));

    const topLessonsByViews = topLessonEntries.map(({ key, count }) => {
      const meta = lessonViews.get(key);
      const courseId = meta?.courseId;
      return {
        id: key as string,
        name: lessonNameById.get(key) ?? "Unknown lesson",
        count,
        percentage: toPercent(count, totalViews),
        courseId: courseId as string | undefined,
        courseName: courseId ? courseNameById.get(courseId) : undefined,
      };
    });

    const topCoursesByWatched = topWatchCourseEntries.map(({ key, count }) => ({
      id: key as string,
      name: courseNameById.get(key) ?? "Unknown course",
      count,
      percentage: toPercent(count, totalWatchedSeconds),
    }));

    const topCourse =
      topCoursesByViews[0] !== undefined
        ? {
            id: topCoursesByViews[0].id,
            name: topCoursesByViews[0].name,
            views: topCoursesByViews[0].count,
          }
        : null;

    const topLesson =
      topLessonsByViews[0] !== undefined
        ? {
            id: topLessonsByViews[0].id,
            name: topLessonsByViews[0].name,
            views: topLessonsByViews[0].count,
          }
        : null;

    return {
      startDate,
      endDate,
      totalViews,
      totalWatchedSeconds,
      totalWatchedHours:
        Math.round((totalWatchedSeconds / 3600) * 1000) / 1000,
      viewsChangePercent,
      previousPeriod: {
        startDate: previous.startDay,
        endDate: previous.endDay,
        totalViews: previousTotalViews,
      },
      viewsByDay: courseViews.byDay.map((d) => ({
        date: d.date,
        views: d.count,
      })),
      topCoursesByViews,
      topLessonsByViews,
      topCoursesByWatched,
      topCourse,
      topLesson,
    };
  },
});

/**
 * Backfill watch buckets from existing lessonProgress rows.
 * Run once after deploy: internal.contentViews.backfillWatchBuckets
 */
export const backfillWatchBuckets = internalMutation({
  args: {},
  returns: v.object({
    processed: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx) => {
    const allProgress = await ctx.db.query("lessonProgress").collect();
    let processed = 0;
    let skipped = 0;

    for (const progress of allProgress) {
      const lesson = await ctx.db.get(progress.lesson_id);
      const course = await ctx.db.get(progress.course_id);
      if (
        !lesson ||
        lesson.deletedAt ||
        !course ||
        course.deletedAt
      ) {
        skipped += 1;
        continue;
      }

      const watchedSeconds =
        progress.watchedSeconds ?? lesson.duration ?? 0;
      if (watchedSeconds <= 0) {
        skipped += 1;
        continue;
      }

      const atMs =
        typeof progress.completedAt === "number" && progress.completedAt > 0
          ? progress.completedAt
          : progress._creationTime;

      await adjustContentBucketsAt(ctx, {
        metric: "watchedSeconds",
        lessonId: progress.lesson_id,
        courseId: progress.course_id,
        delta: watchedSeconds,
        atMs,
      });
      processed += 1;
    }

    return { processed, skipped };
  },
});
