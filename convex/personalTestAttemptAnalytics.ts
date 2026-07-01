import { internalMutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./utils/auth";
import {
  enumerateDayKeys,
  formatDayKey,
  personalTestAnalyticsRangeSchema,
  parseAnalyticsDate,
  previousAnalyticsPeriod,
} from "../shared/validation/personalTestAnalytics";
import {
  attemptCompletionsAggregate,
  attemptStartsAggregate,
  courseAnalyticsNamespace,
  courseRecommendationsAggregate,
  dayBounds,
  getRecommendedCourseIdsForTest,
  backfillAttemptAggregates,
} from "./lib/personalTestAttemptAggregates";

const courseBreakdownItemValidator = v.object({
  courseId: v.union(v.id("courses"), v.null()),
  name: v.string(),
  count: v.number(),
  percentage: v.number(),
});

const analyticsResultValidator = v.object({
  startDate: v.string(),
  endDate: v.string(),
  totalAttempts: v.number(),
  completedAttempts: v.number(),
  totalRecommendations: v.number(),
  completionRate: v.number(),
  previousPeriod: v.object({
    startDate: v.string(),
    endDate: v.string(),
    totalAttempts: v.number(),
  }),
  attemptsChangePercent: v.number(),
  attemptsByDay: v.array(
    v.object({
      date: v.string(),
      attempts: v.number(),
      completed: v.number(),
    }),
  ),
  topCourse: v.union(
    v.object({
      courseId: v.id("courses"),
      name: v.string(),
      count: v.number(),
    }),
    v.null(),
  ),
  courseBreakdown: v.array(courseBreakdownItemValidator),
});

async function countAttemptsInRange(
  ctx: QueryCtx,
  testId: Id<"personalTests">,
  startKey: number,
  endKey: number,
) {
  const bounds = dayBounds(startKey, endKey);
  const [totalAttempts, completedAttempts] = await Promise.all([
    attemptStartsAggregate.count(ctx, { namespace: testId, bounds }),
    attemptCompletionsAggregate.count(ctx, { namespace: testId, bounds }),
  ]);
  return { totalAttempts, completedAttempts };
}

async function buildCourseBreakdown(
  ctx: QueryCtx,
  testId: Id<"personalTests">,
  startKey: number,
  endKey: number,
) {
  const courseIds = await getRecommendedCourseIdsForTest(ctx, testId);
  const bounds = dayBounds(startKey, endKey);

  const recommendationCounts = await courseRecommendationsAggregate.countBatch(
    ctx,
    courseIds.map((courseId) => ({
      namespace: courseAnalyticsNamespace(testId, courseId),
      bounds,
    })),
  );

  const ranked = courseIds
    .map((courseId, index) => ({
      courseId,
      count: recommendationCounts[index] ?? 0,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  const totalRecommendations = ranked.reduce((sum, entry) => sum + entry.count, 0);
  const topEntries = ranked.slice(0, 5);
  const otherCount = ranked.slice(5).reduce((sum, entry) => sum + entry.count, 0);

  const courseBreakdown = [];
  for (const entry of topEntries) {
    const course = await ctx.db.get("courses", entry.courseId);
    if (!course || course.deletedAt !== undefined) {
      continue;
    }
    courseBreakdown.push({
      courseId: entry.courseId,
      name: course.name,
      count: entry.count,
      percentage:
        totalRecommendations > 0
          ? Math.round((entry.count / totalRecommendations) * 1000) / 10
          : 0,
    });
  }

  if (otherCount > 0) {
    courseBreakdown.push({
      courseId: null,
      name: "Other courses",
      count: otherCount,
      percentage:
        totalRecommendations > 0
          ? Math.round((otherCount / totalRecommendations) * 1000) / 10
          : 0,
    });
  }

  const topCourse =
    courseBreakdown.length > 0 && courseBreakdown[0]!.courseId !== null
      ? {
          courseId: courseBreakdown[0]!.courseId!,
          name: courseBreakdown[0]!.name,
          count: courseBreakdown[0]!.count,
        }
      : null;

  return { totalRecommendations, courseBreakdown, topCourse };
}

export const getPersonalTestAttemptAnalytics = query({
  args: {
    testId: v.id("personalTests"),
    startDate: v.string(),
    endDate: v.string(),
  },
  returns: analyticsResultValidator,
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });

    const test = await ctx.db.get("personalTests", args.testId);
    if (!test || test.deletedAt !== undefined) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Test not found.",
      });
    }

    const rangeResult = personalTestAnalyticsRangeSchema.safeParse({
      startDate: args.startDate,
      endDate: args.endDate,
    });
    if (!rangeResult.success) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: rangeResult.error.errors[0]?.message ?? "Invalid date range.",
      });
    }

    const startKey = parseAnalyticsDate(args.startDate)!;
    const endKey = parseAnalyticsDate(args.endDate)!;
    const dayKeys = enumerateDayKeys(startKey, endKey);

    const { totalAttempts, completedAttempts } = await countAttemptsInRange(
      ctx,
      args.testId,
      startKey,
      endKey,
    );

    const previous = previousAnalyticsPeriod(startKey, endKey);
    const previousCounts = await countAttemptsInRange(
      ctx,
      args.testId,
      previous.startKey,
      previous.endKey,
    );

    const attemptsChangePercent =
      previousCounts.totalAttempts === 0
        ? totalAttempts > 0
          ? 100
          : 0
        : Math.round(
            ((totalAttempts - previousCounts.totalAttempts) /
              previousCounts.totalAttempts) *
              1000,
          ) / 10;

    const [attemptsByDayCounts, completedByDayCounts] = await Promise.all([
      attemptStartsAggregate.countBatch(
        ctx,
        dayKeys.map((dayKey) => ({
          namespace: args.testId,
          bounds: dayBounds(dayKey, dayKey),
        })),
      ),
      attemptCompletionsAggregate.countBatch(
        ctx,
        dayKeys.map((dayKey) => ({
          namespace: args.testId,
          bounds: dayBounds(dayKey, dayKey),
        })),
      ),
    ]);

    const attemptsByDay = dayKeys.map((dayKey, index) => ({
      date: formatDayKey(dayKey),
      attempts: attemptsByDayCounts[index] ?? 0,
      completed: completedByDayCounts[index] ?? 0,
    }));

    const { totalRecommendations, courseBreakdown, topCourse } =
      await buildCourseBreakdown(ctx, args.testId, startKey, endKey);

    const completionRate =
      totalAttempts > 0
        ? Math.round((completedAttempts / totalAttempts) * 1000) / 10
        : 0;

    return {
      startDate: args.startDate,
      endDate: args.endDate,
      totalAttempts,
      completedAttempts,
      totalRecommendations,
      completionRate,
      previousPeriod: {
        startDate: previous.startDate,
        endDate: previous.endDate,
        totalAttempts: previousCounts.totalAttempts,
      },
      attemptsChangePercent,
      attemptsByDay,
      topCourse,
      courseBreakdown,
    };
  },
});

const BACKFILL_BATCH_SIZE = 100;

/** Backfill analytics aggregates from existing attempts. Run once after deploy. */
export const backfillPersonalTestAttemptAggregates = internalMutation({
  args: {
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    processed: v.number(),
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("personalTestAttempts")
      .paginate({
        cursor: cursor ?? null,
        numItems: BACKFILL_BATCH_SIZE,
      });

    for (const attempt of page.page) {
      await backfillAttemptAggregates(ctx, attempt);
    }

    return {
      processed: page.page.length,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});
