import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import {
  MAX_TEST_ATTEMPT_LIFETIME_MS,
  MAX_TEST_DURATION_SECONDS,
  MIN_TEST_DURATION_SECONDS,
  personalTestDurationSchema,
} from "../../shared/validation/personalTest";

export function validateDurationSeconds(durationSeconds: number) {
  const result = personalTestDurationSchema.safeParse(durationSeconds);
  if (!result.success) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: result.error.errors[0]?.message ?? "Invalid duration.",
    });
  }
  return result.data;
}

export function getResultSettingsForAttempt(
  test: Doc<"personalTests">,
  isPreview: boolean,
) {
  if (isPreview || !test.publishedSnapshot) {
    return test.resultSettings;
  }

  try {
    const snapshot = JSON.parse(test.publishedSnapshot) as {
      resultSettings?: { showAll: boolean; maxCourses?: number };
    };
    return snapshot.resultSettings ?? test.resultSettings;
  } catch {
    return test.resultSettings;
  }
}

export function isAttemptExpired(startedAt: number, now = Date.now()) {
  return now - startedAt >= MAX_TEST_ATTEMPT_LIFETIME_MS;
}

export function getExpiredAttemptDurationSeconds(
  startedAt: number,
  now = Date.now(),
) {
  const elapsedSeconds = Math.floor((now - startedAt) / 1000);
  return Math.min(Math.max(elapsedSeconds, MIN_TEST_DURATION_SECONDS), MAX_TEST_DURATION_SECONDS);
}

export function validateDurationAgainstStartedAt(
  durationSeconds: number,
  startedAt: number,
  now = Date.now(),
) {
  if (isAttemptExpired(startedAt, now)) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "This attempt has expired.",
    });
  }

  validateDurationSeconds(durationSeconds);
  const elapsedSeconds = Math.floor((now - startedAt) / 1000);
  if (durationSeconds > elapsedSeconds + 60) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Duration exceeds elapsed time for this attempt.",
    });
  }
}

export async function computeRecommendedCourses(
  ctx: QueryCtx | MutationCtx,
  testId: Id<"personalTests">,
  selectedAnswerIds: Array<Id<"personalTestAnswers">>,
  resultSettings: { showAll: boolean; maxCourses?: number },
) {
  const scoreMap = new Map<Id<"courses">, number>();
  for (const answerId of selectedAnswerIds) {
    const answer = await ctx.db.get("personalTestAnswers", answerId);
    if (!answer || answer.testId !== testId) {
      continue;
    }
    for (const courseId of answer.recommendedCourseIds) {
      scoreMap.set(courseId, (scoreMap.get(courseId) ?? 0) + 1);
    }
  }

  let ranked = Array.from(scoreMap.entries()).sort((a, b) => b[1] - a[1]);
  if (!resultSettings.showAll && resultSettings.maxCourses) {
    ranked = ranked.slice(0, resultSettings.maxCourses);
  }

  const courses = [];
  for (const [courseId] of ranked) {
    const course = await ctx.db.get("courses", courseId);
    if (course && course.deletedAt === undefined) {
      courses.push({
        _id: course._id,
        name: course.name,
        name_ar: course.name_ar,
        thumbnail_image_url: course.thumbnail_image_url,
      });
    }
  }

  return {
    courseIds: courses.map((c) => c._id),
    courses,
  };
}

export {
  MAX_TEST_ATTEMPT_LIFETIME_MS,
  MIN_TEST_DURATION_SECONDS,
  MAX_TEST_DURATION_SECONDS,
};
