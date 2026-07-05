import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  kuwaitDayEndMs,
  kuwaitDayStartMs,
  parseAnalyticsDate,
} from "../../shared/validation/personalTestAnalytics";

const MAX_SUBMISSION_ROWS = 10_000;

export type SubmissionAnswer = {
  answerId: Id<"personalTestAnswers">;
  text: string;
  text_ar: string;
};

export type SubmissionQuestionResponse = {
  questionId: Id<"personalTestQuestions">;
  questionTitle: string;
  questionTitleAr: string;
  answerType: "single" | "multi";
  selectedAnswers: SubmissionAnswer[];
};

export type SubmissionRecommendedCourse = {
  courseId: Id<"courses">;
  name: string;
  name_ar: string;
  thumbnail_image_url?: string;
};

export type SubmissionRow = {
  attemptId: Id<"personalTestAttempts">;
  userName?: string;
  userEmail?: string;
  userImage?: string;
  completedAt: number;
  durationSeconds?: number;
  selectedAnswerCount: number;
  questionCount: number;
  recommendedCourses: SubmissionRecommendedCourse[];
  responses: SubmissionQuestionResponse[];
};

export type SubmissionDetail = SubmissionRow & {
  testName: string;
  testNameAr: string;
};

type TestQuestionStructure = Array<{
  question: Doc<"personalTestQuestions">;
  answers: Doc<"personalTestAnswers">[];
}>;

type CourseSummary = {
  name: string;
  name_ar: string;
  thumbnail_image_url?: string;
};

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

async function loadTestQuestionStructure(
  ctx: QueryCtx,
  testId: Id<"personalTests">,
): Promise<TestQuestionStructure> {
  const questions = await ctx.db
    .query("personalTestQuestions")
    .withIndex("by_testId_displayOrder", (q) => q.eq("testId", testId))
    .collect();

  const structure: TestQuestionStructure = [];
  for (const question of questions) {
    const answers = await ctx.db
      .query("personalTestAnswers")
      .withIndex("by_questionId", (q) => q.eq("questionId", question._id))
      .collect();
    answers.sort((a, b) => a.displayOrder - b.displayOrder);
    structure.push({ question, answers });
  }

  return structure;
}

function buildQuestionResponses(
  structure: TestQuestionStructure,
  selectedAnswerIds: Array<Id<"personalTestAnswers">> | undefined,
): SubmissionQuestionResponse[] {
  const selectedSet = new Set(selectedAnswerIds ?? []);

  return structure.map(({ question, answers }) => ({
    questionId: question._id,
    questionTitle: question.title,
    questionTitleAr: question.title_ar,
    answerType: question.answerType,
    selectedAnswers: answers
      .filter((answer) => selectedSet.has(answer._id))
      .map((answer) => ({
        answerId: answer._id,
        text: answer.text,
        text_ar: answer.text_ar,
      })),
  }));
}

async function loadRecommendedCourses(
  ctx: QueryCtx,
  courseIds: Array<Id<"courses">> | undefined,
  courseCache: Map<Id<"courses">, CourseSummary | null>,
): Promise<SubmissionRecommendedCourse[]> {
  const recommendedCourses: SubmissionRecommendedCourse[] = [];

  for (const courseId of courseIds ?? []) {
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

  return recommendedCourses;
}

function buildSubmissionRow(
  attempt: Doc<"personalTestAttempts">,
  user: Doc<"users"> | null | undefined,
  questionStructure: TestQuestionStructure,
  recommendedCourses: SubmissionRecommendedCourse[],
): SubmissionRow {
  const questionCount = questionStructure.length;

  return {
    attemptId: attempt._id,
    userName: user?.name,
    userEmail: user?.email,
    userImage: user?.image,
    completedAt: attempt.completedAt!,
    durationSeconds: attempt.durationSeconds,
    selectedAnswerCount: attempt.selectedAnswerIds?.length ?? 0,
    questionCount,
    recommendedCourses,
    responses: buildQuestionResponses(questionStructure, attempt.selectedAnswerIds),
  };
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

  const questionStructure = await loadTestQuestionStructure(ctx, args.testId);
  const questionCount = questionStructure.length;
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
  const courseCache = new Map<Id<"courses">, CourseSummary | null>();
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

    const recommendedCourses = await loadRecommendedCourses(
      ctx,
      attempt.recommendedCourseIds,
      courseCache,
    );

    rows.push(
      buildSubmissionRow(attempt, user, questionStructure, recommendedCourses),
    );
  }

  return { rows, questionCount };
}

export async function loadPersonalTestSubmissionById(
  ctx: QueryCtx,
  testId: Id<"personalTests">,
  attemptId: Id<"personalTestAttempts">,
): Promise<SubmissionDetail | null> {
  const attempt = await ctx.db.get("personalTestAttempts", attemptId);
  if (
    !attempt ||
    attempt.testId !== testId ||
    attempt.status !== "completed" ||
    attempt.completedAt === undefined ||
    (attempt.isPreview ?? false)
  ) {
    return null;
  }

  const test = await ctx.db.get("personalTests", testId);
  if (!test || test.deletedAt !== undefined) {
    return null;
  }

  const user = await ctx.db.get("users", attempt.userId);
  const questionStructure = await loadTestQuestionStructure(ctx, testId);
  const courseCache = new Map<Id<"courses">, CourseSummary | null>();
  const recommendedCourses = await loadRecommendedCourses(
    ctx,
    attempt.recommendedCourseIds,
    courseCache,
  );

  const row = buildSubmissionRow(
    attempt,
    user,
    questionStructure,
    recommendedCourses,
  );

  return {
    ...row,
    testName: test.name,
    testNameAr: test.name_ar,
  };
}

export type MyCompletedAttemptSummary = {
  attemptId: Id<"personalTestAttempts">;
  testId: Id<"personalTests">;
  testName: string;
  testNameAr: string;
  completedAt: number;
  durationSeconds?: number;
  recommendedCourseCount: number;
  recommendedCourses: SubmissionRecommendedCourse[];
};

export async function loadMyCompletedPersonalTestAttempts(
  ctx: QueryCtx,
  userId: Id<"users">,
  limit: number,
): Promise<MyCompletedAttemptSummary[]> {
  const attempts = await ctx.db
    .query("personalTestAttempts")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .take(Math.min(Math.max(limit, 1), 50) * 4);

  const courseCache = new Map<Id<"courses">, CourseSummary | null>();
  const testCache = new Map<
    Id<"personalTests">,
    { name: string; name_ar: string } | null
  >();
  const results: MyCompletedAttemptSummary[] = [];

  for (const attempt of attempts) {
    if (results.length >= limit) {
      break;
    }
    if (attempt.status !== "completed" || attempt.completedAt === undefined) {
      continue;
    }
    if (attempt.isPreview ?? false) {
      continue;
    }

    if (!testCache.has(attempt.testId)) {
      const test = await ctx.db.get("personalTests", attempt.testId);
      testCache.set(
        attempt.testId,
        test && test.deletedAt === undefined
          ? { name: test.name, name_ar: test.name_ar }
          : null,
      );
    }
    const test = testCache.get(attempt.testId);
    if (!test) {
      continue;
    }

    const recommendedCourses = await loadRecommendedCourses(
      ctx,
      attempt.recommendedCourseIds,
      courseCache,
    );

    results.push({
      attemptId: attempt._id,
      testId: attempt.testId,
      testName: test.name,
      testNameAr: test.name_ar,
      completedAt: attempt.completedAt,
      durationSeconds: attempt.durationSeconds,
      recommendedCourseCount: recommendedCourses.length,
      recommendedCourses,
    });
  }

  return results;
}

export async function loadMyPersonalTestAttemptResults(
  ctx: QueryCtx,
  userId: Id<"users">,
  attemptId: Id<"personalTestAttempts">,
): Promise<SubmissionDetail | null> {
  const attempt = await ctx.db.get("personalTestAttempts", attemptId);
  if (
    !attempt ||
    attempt.userId !== userId ||
    attempt.status !== "completed" ||
    attempt.completedAt === undefined ||
    (attempt.isPreview ?? false)
  ) {
    return null;
  }

  return await loadPersonalTestSubmissionById(ctx, attempt.testId, attemptId);
}

export { MAX_SUBMISSION_ROWS };
