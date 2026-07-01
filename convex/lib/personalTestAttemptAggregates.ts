import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { DirectAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import { toAnalyticsDateKey } from "../../shared/validation/personalTestAnalytics";

type TestNamespace = Id<"personalTests">;
type CourseNamespace = `${Id<"personalTests">}|${Id<"courses">}`;

export function courseAnalyticsNamespace(
  testId: Id<"personalTests">,
  courseId: Id<"courses">,
): CourseNamespace {
  return `${testId}|${courseId}`;
}

/** Attempts started on a calendar day (Kuwait time), excluding preview runs. */
export const attemptStartsAggregate = new DirectAggregate<{
  Key: number;
  Id: Id<"personalTestAttempts">;
  Namespace: TestNamespace;
}>(components.aggregatePersonalTestAttemptStarts);

/** Completed attempts by completion day (Kuwait time), excluding preview runs. */
export const attemptCompletionsAggregate = new DirectAggregate<{
  Key: number;
  Id: Id<"personalTestAttempts">;
  Namespace: TestNamespace;
}>(components.aggregatePersonalTestAttemptCompletions);

/** Course recommendations by completion day, one entry per (attempt, course). */
export const courseRecommendationsAggregate = new DirectAggregate<{
  Key: number;
  Id: `${Id<"personalTestAttempts">}|${Id<"courses">}`;
  Namespace: CourseNamespace;
}>(components.aggregatePersonalTestCourseRecommendations);

export function dayBounds(startKey: number, endKey: number) {
  return {
    lower: { key: startKey, inclusive: true as const },
    upper: { key: endKey, inclusive: true as const },
  };
}

export async function getRecommendedCourseIdsForTest(
  ctx: QueryCtx | MutationCtx,
  testId: Id<"personalTests">,
): Promise<Array<Id<"courses">>> {
  const answers = await ctx.db
    .query("personalTestAnswers")
    .withIndex("by_testId", (q) => q.eq("testId", testId))
    .collect();

  const courseIds = new Set<Id<"courses">>();
  for (const answer of answers) {
    for (const courseId of answer.recommendedCourseIds) {
      courseIds.add(courseId);
    }
  }

  return Array.from(courseIds);
}

export async function syncAttemptStartAggregate(
  ctx: MutationCtx,
  attempt: Doc<"personalTestAttempts">,
) {
  if (attempt.isPreview ?? false) {
    return;
  }

  await attemptStartsAggregate.insertIfDoesNotExist(ctx, {
    namespace: attempt.testId,
    key: toAnalyticsDateKey(attempt.startedAt),
    id: attempt._id,
  });
}

export async function syncAttemptCompletionAggregates(
  ctx: MutationCtx,
  attempt: Doc<"personalTestAttempts">,
  recommendedCourseIds: Array<Id<"courses">>,
  completedAt: number,
) {
  if (attempt.isPreview ?? false) {
    return;
  }

  const dayKey = toAnalyticsDateKey(completedAt);

  await attemptCompletionsAggregate.insertIfDoesNotExist(ctx, {
    namespace: attempt.testId,
    key: dayKey,
    id: attempt._id,
  });

  for (const courseId of recommendedCourseIds) {
    await courseRecommendationsAggregate.insertIfDoesNotExist(ctx, {
      namespace: courseAnalyticsNamespace(attempt.testId, courseId),
      key: dayKey,
      id: `${attempt._id}|${courseId}`,
    });
  }
}

export async function backfillAttemptAggregates(
  ctx: MutationCtx,
  attempt: Doc<"personalTestAttempts">,
) {
  if (attempt.isPreview ?? false) {
    return;
  }

  await syncAttemptStartAggregate(ctx, attempt);

  if (
    attempt.status === "completed" &&
    attempt.completedAt !== undefined &&
    attempt.recommendedCourseIds !== undefined
  ) {
    await syncAttemptCompletionAggregates(
      ctx,
      attempt,
      attempt.recommendedCourseIds,
      attempt.completedAt,
    );
  }
}
