import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  kuwaitDayEndMs,
  kuwaitDayStartMs,
  parseAnalyticsDate,
} from "../../shared/validation/personalTestAnalytics";

const MAX_SUBMISSION_ROWS = 10_000;

export type SubmissionRow = {
  attemptId: Id<"personalTestAttempts">;
  userName?: string;
  userEmail?: string;
  userImage?: string;
  completedAt: number;
  durationSeconds?: number;
  selectedAnswerCount: number;
  questionCount: number;
  recommendedCourses: Array<{
    courseId: Id<"courses">;
    name: string;
    name_ar: string;
    thumbnail_image_url?: string;
  }>;
};

async function getQuestionCount(ctx: QueryCtx, testId: Id<"personalTests">) {
  const questions = await ctx.db
    .query("personalTestQuestions")
    .withIndex("by_testId", (q) => q.eq("testId", testId))
    .collect();
  return questions.length;
}

function matchesSearch(
  user: Doc<"users"> | null | undefined,
  search: string | undefined,
) {
  if (!search) {
    return true;
  }

  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const name = user?.name?.toLowerCase() ?? "";
  const email = user?.email?.toLowerCase() ?? "";
  return name.includes(query) || email.includes(query);
}

export async function loadPersonalTestSubmissions(
  ctx: QueryCtx,
  args: {
    testId: Id<"personalTests">;
    startDate: string;
    endDate: string;
    search?: string;
  },
): Promise<{ rows: SubmissionRow[]; questionCount: number }> {
  const startKey = parseAnalyticsDate(args.startDate);
  const endKey = parseAnalyticsDate(args.endDate);
  if (startKey === null || endKey === null) {
    return { rows: [], questionCount: 0 };
  }

  const questionCount = await getQuestionCount(ctx, args.testId);
  const startMs = kuwaitDayStartMs(startKey);
  const endMs = kuwaitDayEndMs(endKey);

  const attempts = await ctx.db
    .query("personalTestAttempts")
    .withIndex("by_testId_status_completedAt", (q) =>
      q
        .eq("testId", args.testId)
        .eq("status", "completed")
        .gte("completedAt", startMs)
        .lte("completedAt", endMs),
    )
    .order("desc")
    .take(MAX_SUBMISSION_ROWS);

  const userCache = new Map<Id<"users">, Doc<"users"> | null>();
  const courseCache = new Map<
    Id<"courses">,
    {
      name: string;
      name_ar: string;
      thumbnail_image_url?: string;
    } | null
  >();

  const rows: SubmissionRow[] = [];

  for (const attempt of attempts) {
    if (attempt.isPreview ?? false) {
      continue;
    }
    if (attempt.completedAt === undefined) {
      continue;
    }

    if (!userCache.has(attempt.userId)) {
      userCache.set(attempt.userId, await ctx.db.get("users", attempt.userId));
    }
    const user = userCache.get(attempt.userId);
    if (!matchesSearch(user, args.search)) {
      continue;
    }

    const recommendedCourses = [];
    for (const courseId of attempt.recommendedCourseIds ?? []) {
      if (!courseCache.has(courseId)) {
        const course = await ctx.db.get("courses", courseId);
        courseCache.set(
          courseId,
          course && course.deletedAt === undefined
            ? {
                name: course.name,
                name_ar: course.name_ar,
                thumbnail_image_url: course.thumbnail_image_url,
              }
            : null,
        );
      }
      const course = courseCache.get(courseId);
      if (course) {
        recommendedCourses.push({
          courseId,
          ...course,
        });
      }
    }

    rows.push({
      attemptId: attempt._id,
      userName: user?.name,
      userEmail: user?.email,
      userImage: user?.image,
      completedAt: attempt.completedAt,
      durationSeconds: attempt.durationSeconds,
      selectedAnswerCount: attempt.selectedAnswerIds?.length ?? 0,
      questionCount,
      recommendedCourses,
    });
  }

  return { rows, questionCount };
}

export { MAX_SUBMISSION_ROWS };
