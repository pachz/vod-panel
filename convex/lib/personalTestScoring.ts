import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError, v } from "convex/values";
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

export const matchedPersonalTestResultValidator = v.object({
  _id: v.id("personalTestResults"),
  title: v.string(),
  title_ar: v.string(),
  description: v.optional(v.string()),
  description_ar: v.optional(v.string()),
  cover_image_url: v.optional(v.string()),
  color: v.optional(v.string()),
  ctaText: v.optional(v.string()),
  ctaText_ar: v.optional(v.string()),
  ctaUrl: v.optional(v.string()),
});

export type MatchedPersonalTestResult = {
  _id: Id<"personalTestResults">;
  title: string;
  title_ar: string;
  description?: string;
  description_ar?: string;
  cover_image_url?: string;
  color?: string;
  ctaText?: string;
  ctaText_ar?: string;
  ctaUrl?: string;
};

export function toMatchedPersonalTestResult(
  result: Doc<"personalTestResults">,
): MatchedPersonalTestResult {
  return {
    _id: result._id,
    title: result.title,
    title_ar: result.title_ar,
    description: result.description,
    description_ar: result.description_ar,
    cover_image_url: result.cover_image_url,
    color: result.color,
    ctaText: result.ctaText,
    ctaText_ar: result.ctaText_ar,
    ctaUrl: result.ctaUrl,
  };
}

async function loadCoursesForIds(
  ctx: QueryCtx | MutationCtx,
  courseIds: Array<Id<"courses">>,
  resultSettings: { showAll: boolean; maxCourses?: number },
) {
  let ids = courseIds;
  if (!resultSettings.showAll && resultSettings.maxCourses) {
    ids = ids.slice(0, resultSettings.maxCourses);
  }

  const courses = [];
  for (const courseId of ids) {
    const course = await ctx.db.get("courses", courseId);
    if (course && course.deletedAt === undefined) {
      courses.push({
        _id: course._id,
        name: course.name,
        name_ar: course.name_ar,
        thumbnail_image_url: course.thumbnail_image_url,
        short_description: course.short_description,
        short_description_ar: course.short_description_ar,
      });
    }
  }

  return courses;
}

export async function computeRecommendedCourses(
  ctx: QueryCtx | MutationCtx,
  testId: Id<"personalTests">,
  selectedAnswerIds: Array<Id<"personalTestAnswers">>,
  resultSettings: { showAll: boolean; maxCourses?: number },
) {
  const resultVotes = new Map<Id<"personalTestResults">, number>();
  for (const answerId of selectedAnswerIds) {
    const answer = await ctx.db.get("personalTestAnswers", answerId);
    if (!answer || answer.testId !== testId) {
      continue;
    }
    const correlations = await ctx.db
      .query("personalTestResultCorrelations")
      .withIndex("by_answerId", (q) => q.eq("answerId", answerId))
      .collect();
    for (const row of correlations) {
      resultVotes.set(row.resultId, (resultVotes.get(row.resultId) ?? 0) + 1);
    }
  }

  const scored: Array<{ result: Doc<"personalTestResults">; votes: number }> = [];
  for (const [resultId, votes] of resultVotes) {
    const result = await ctx.db.get("personalTestResults", resultId);
    if (!result || result.testId !== testId) {
      continue;
    }
    scored.push({ result, votes });
  }

  scored.sort((a, b) => {
    if (b.votes !== a.votes) {
      return b.votes - a.votes;
    }
    if (a.result.displayOrder !== b.result.displayOrder) {
      return a.result.displayOrder - b.result.displayOrder;
    }
    return a.result.createdAt - b.result.createdAt;
  });

  const winner = scored[0]?.result ?? null;
  const courses = winner
    ? await loadCoursesForIds(
        ctx,
        winner.recommendedCourseIds ?? [],
        resultSettings,
      )
    : [];

  return {
    result: winner ? toMatchedPersonalTestResult(winner) : null,
    resultId: winner?._id ?? null,
    courseIds: courses.map((c) => c._id),
    courses,
  };
}

export {
  MAX_TEST_ATTEMPT_LIFETIME_MS,
  MIN_TEST_DURATION_SECONDS,
  MAX_TEST_DURATION_SECONDS,
};
