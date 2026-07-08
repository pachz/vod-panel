import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  personalTestCompleteAttemptSchema,
} from "../shared/validation/personalTest";
import { requireUser } from "./utils/auth";
import {
  computeRecommendedCourses,
  getExpiredAttemptDurationSeconds,
  getResultSettingsForAttempt,
  isAttemptExpired,
  validateDurationAgainstStartedAt,
} from "./lib/personalTestScoring";
import {
  syncAttemptCompletionAggregates,
  syncAttemptStartAggregate,
} from "./lib/personalTestAttemptAggregates";
import {
  loadMyCompletedPersonalTestAttempts,
  loadMyPersonalTestAttemptResults,
} from "./lib/personalTestSubmissions";

const attemptStatusValidator = v.union(
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("abandoned"),
  v.literal("expired"),
);

const attemptListItemValidator = v.object({
  _id: v.id("personalTestAttempts"),
  _creationTime: v.number(),
  testId: v.id("personalTests"),
  userId: v.id("users"),
  userName: v.optional(v.string()),
  userEmail: v.optional(v.string()),
  status: attemptStatusValidator,
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  durationSeconds: v.optional(v.number()),
  selectedAnswerCount: v.number(),
  recommendedCourseCount: v.number(),
  isPreview: v.boolean(),
});

const courseResultValidator = v.object({
  _id: v.id("courses"),
  name: v.string(),
  name_ar: v.string(),
  thumbnail_image_url: v.optional(v.string()),
  short_description: v.optional(v.string()),
  short_description_ar: v.optional(v.string()),
});

const myAttemptCourseValidator = v.object({
  courseId: v.id("courses"),
  name: v.string(),
  name_ar: v.string(),
  thumbnail_image_url: v.optional(v.string()),
  short_description: v.optional(v.string()),
  short_description_ar: v.optional(v.string()),
});

const myAttemptAnswerValidator = v.object({
  answerId: v.id("personalTestAnswers"),
  text: v.string(),
  text_ar: v.string(),
});

const myAttemptResponseValidator = v.object({
  questionId: v.id("personalTestQuestions"),
  questionTitle: v.string(),
  questionTitleAr: v.string(),
  answerType: v.union(v.literal("single"), v.literal("multi")),
  selectedAnswers: v.array(myAttemptAnswerValidator),
});

const myAttemptResultsValidator = v.object({
  attemptId: v.id("personalTestAttempts"),
  userName: v.optional(v.string()),
  userEmail: v.optional(v.string()),
  userImage: v.optional(v.string()),
  completedAt: v.number(),
  durationSeconds: v.optional(v.number()),
  selectedAnswerCount: v.number(),
  questionCount: v.number(),
  recommendedCourses: v.array(myAttemptCourseValidator),
  responses: v.array(myAttemptResponseValidator),
  testName: v.string(),
  testNameAr: v.string(),
});

async function getUserIdOrThrow(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "You must be signed in to continue.",
    });
  }
  return userId as Id<"users">;
}

async function getTestForAttempt(
  ctx: QueryCtx | MutationCtx,
  testId: Id<"personalTests">,
  isPreview: boolean,
) {
  const test = await ctx.db.get("personalTests", testId);
  if (!test || test.deletedAt !== undefined) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Test not found.",
    });
  }

  if (isPreview) {
    await requireUser(ctx, { requireTech: true });
    return test;
  }

  await requireUser(ctx, { requireTech: true });
  if (test.status !== "published") {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "This test is not available.",
    });
  }

  return test;
}

async function getOwnedAttemptOrThrow(
  ctx: QueryCtx | MutationCtx,
  attemptId: Id<"personalTestAttempts">,
  userId: Id<"users">,
) {
  const attempt = await ctx.db.get("personalTestAttempts", attemptId);
  if (!attempt) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Attempt not found.",
    });
  }
  if (attempt.userId !== userId) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "You do not have access to this attempt.",
    });
  }
  return attempt;
}

function validateCompleteAttemptInput(args: {
  durationSeconds: number;
  selectedAnswerIds: Array<Id<"personalTestAnswers">>;
}) {
  const result = personalTestCompleteAttemptSchema.safeParse({
    durationSeconds: args.durationSeconds,
    selectedAnswerIds: args.selectedAnswerIds.map(String),
  });
  if (!result.success) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: result.error.errors[0]?.message ?? "Invalid attempt data.",
    });
  }
}

async function expireAttemptIfNeeded(
  ctx: MutationCtx,
  attempt: Doc<"personalTestAttempts">,
  now = Date.now(),
): Promise<Doc<"personalTestAttempts">> {
  if (attempt.status !== "in_progress" || !isAttemptExpired(attempt.startedAt, now)) {
    return attempt;
  }

  await ctx.db.patch(attempt._id, {
    status: "expired",
    completedAt: now,
    durationSeconds: getExpiredAttemptDurationSeconds(attempt.startedAt, now),
  });

  const updated = await ctx.db.get("personalTestAttempts", attempt._id);
  return updated ?? { ...attempt, status: "expired" as const };
}

function assertAttemptInProgress(attempt: Doc<"personalTestAttempts">) {
  if (attempt.status === "expired") {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "This attempt has expired.",
    });
  }
  if (attempt.status !== "in_progress") {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "This attempt has already ended.",
    });
  }
}

async function expireStaleInProgressAttemptsForUser(
  ctx: MutationCtx,
  testId: Id<"personalTests">,
  userId: Id<"users">,
  isPreview: boolean,
  now = Date.now(),
) {
  const attempts = await ctx.db
    .query("personalTestAttempts")
    .withIndex("by_testId_userId", (q) =>
      q.eq("testId", testId).eq("userId", userId),
    )
    .order("desc")
    .take(20);

  for (const attempt of attempts) {
    if (
      attempt.status === "in_progress" &&
      (attempt.isPreview ?? false) === isPreview
    ) {
      await expireAttemptIfNeeded(ctx, attempt, now);
    }
  }
}

export const startPersonalTestAttempt = mutation({
  args: {
    testId: v.id("personalTests"),
    isPreview: v.optional(v.boolean()),
  },
  returns: v.object({
    attemptId: v.id("personalTestAttempts"),
    startedAt: v.number(),
  }),
  handler: async (ctx, { testId, isPreview = false }) => {
    const userId = await getUserIdOrThrow(ctx);
    await getTestForAttempt(ctx, testId, isPreview);

    const now = Date.now();
    await expireStaleInProgressAttemptsForUser(ctx, testId, userId, isPreview, now);

    const attemptId = await ctx.db.insert("personalTestAttempts", {
      testId,
      userId,
      status: "in_progress",
      startedAt: now,
      isPreview,
    });

    const attempt = await ctx.db.get("personalTestAttempts", attemptId);
    if (attempt) {
      await syncAttemptStartAggregate(ctx, attempt);
    }

    return {
      attemptId,
      startedAt: attempt!.startedAt,
    };
  },
});

export const completePersonalTestAttempt = mutation({
  args: {
    attemptId: v.id("personalTestAttempts"),
    durationSeconds: v.number(),
    selectedAnswerIds: v.array(v.id("personalTestAnswers")),
  },
  returns: v.object({
    durationSeconds: v.number(),
    recommendedCourseIds: v.array(v.id("courses")),
    courses: v.array(courseResultValidator),
  }),
  handler: async (ctx, args) => {
    const userId = await getUserIdOrThrow(ctx);
    let attempt = await getOwnedAttemptOrThrow(ctx, args.attemptId, userId);
    if (!(attempt.isPreview ?? false)) {
      await requireUser(ctx, { requireTech: true });
    }
    attempt = await expireAttemptIfNeeded(ctx, attempt);
    assertAttemptInProgress(attempt);

    validateCompleteAttemptInput(args);
    validateDurationAgainstStartedAt(
      args.durationSeconds,
      attempt.startedAt,
    );

    const test = await ctx.db.get("personalTests", attempt.testId);
    if (!test || test.deletedAt !== undefined) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Test not found.",
      });
    }

    const { courseIds, courses } = await computeRecommendedCourses(
      ctx,
      attempt.testId,
      args.selectedAnswerIds,
      getResultSettingsForAttempt(test, attempt.isPreview ?? false),
    );

    const now = Date.now();
    await ctx.db.patch(args.attemptId, {
      status: "completed",
      completedAt: now,
      durationSeconds: args.durationSeconds,
      selectedAnswerIds: args.selectedAnswerIds,
      recommendedCourseIds: courseIds,
    });

    const completedAttempt = await ctx.db.get("personalTestAttempts", args.attemptId);
    if (completedAttempt) {
      await syncAttemptCompletionAggregates(
        ctx,
        completedAttempt,
        courseIds,
        now,
      );
    }

    return {
      durationSeconds: args.durationSeconds,
      recommendedCourseIds: courseIds,
      courses,
    };
  },
});

export const abandonPersonalTestAttempt = mutation({
  args: {
    attemptId: v.id("personalTestAttempts"),
    durationSeconds: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { attemptId, durationSeconds }) => {
    const userId = await getUserIdOrThrow(ctx);
    let attempt = await getOwnedAttemptOrThrow(ctx, attemptId, userId);
    if (!(attempt.isPreview ?? false)) {
      await requireUser(ctx, { requireTech: true });
    }
    attempt = await expireAttemptIfNeeded(ctx, attempt);

    if (attempt.status !== "in_progress") {
      return null;
    }

    let validatedDuration: number | undefined;
    if (durationSeconds !== undefined) {
      validateDurationAgainstStartedAt(durationSeconds, attempt.startedAt);
      validatedDuration = durationSeconds;
    }

    await ctx.db.patch(attemptId, {
      status: "abandoned",
      completedAt: Date.now(),
      durationSeconds: validatedDuration,
    });
    return null;
  },
});

export const getMyInProgressAttempt = query({
  args: {
    testId: v.id("personalTests"),
    isPreview: v.optional(v.boolean()),
  },
  returns: v.union(
    v.object({
      _id: v.id("personalTestAttempts"),
      startedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, { testId, isPreview = false }) => {
    const userId = await getUserIdOrThrow(ctx);
    await getTestForAttempt(ctx, testId, isPreview);

    const attempts = await ctx.db
      .query("personalTestAttempts")
      .withIndex("by_testId_userId", (q) =>
        q.eq("testId", testId).eq("userId", userId),
      )
      .order("desc")
      .take(20);

    const inProgress = attempts.find(
      (attempt) =>
        attempt.status === "in_progress" &&
        (attempt.isPreview ?? false) === isPreview &&
        !isAttemptExpired(attempt.startedAt),
    );

    if (!inProgress) {
      return null;
    }

    return {
      _id: inProgress._id,
      startedAt: inProgress.startedAt,
    };
  },
});

export const listPersonalTestAttempts = query({
  args: {
    testId: v.id("personalTests"),
    limit: v.optional(v.number()),
  },
  returns: v.array(attemptListItemValidator),
  handler: async (ctx, { testId, limit = 50 }) => {
    await requireUser(ctx, { requireTech: true });

    const test = await ctx.db.get("personalTests", testId);
    if (!test || test.deletedAt !== undefined) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Test not found.",
      });
    }

    const numItems = Math.min(Math.max(limit, 1), 100);
    const attempts = await ctx.db
      .query("personalTestAttempts")
      .withIndex("by_testId", (q) => q.eq("testId", testId))
      .order("desc")
      .take(numItems);

    const userCache = new Map<Id<"users">, Doc<"users"> | null>();
    const results = [];

    for (const attempt of attempts) {
      if (!userCache.has(attempt.userId)) {
        userCache.set(attempt.userId, await ctx.db.get("users", attempt.userId));
      }
      const user = userCache.get(attempt.userId);

      results.push({
        _id: attempt._id,
        _creationTime: attempt._creationTime,
        testId: attempt.testId,
        userId: attempt.userId,
        userName: user?.name,
        userEmail: user?.email,
        status: attempt.status,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        durationSeconds: attempt.durationSeconds,
        selectedAnswerCount: attempt.selectedAnswerIds?.length ?? 0,
        recommendedCourseCount: attempt.recommendedCourseIds?.length ?? 0,
        isPreview: attempt.isPreview ?? false,
      });
    }

    return results;
  },
});

export const listMyCompletedPersonalTestAttempts = query({
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    page: v.array(
      v.object({
        attemptId: v.id("personalTestAttempts"),
        testId: v.id("personalTests"),
        testName: v.string(),
        testNameAr: v.string(),
        completedAt: v.number(),
        durationSeconds: v.optional(v.number()),
        recommendedCourseCount: v.number(),
        recommendedCourses: v.array(myAttemptCourseValidator),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { search, limit = 10, cursor }) => {
    await requireUser(ctx, { requireTech: true });
    const userId = await getUserIdOrThrow(ctx);
    const numItems = Math.min(Math.max(limit ?? 10, 1), 50);
    return await loadMyCompletedPersonalTestAttempts(ctx, userId, {
      limit: numItems,
      search,
      cursor,
    });
  },
});

export const getMyPersonalTestAttemptResults = query({
  args: {
    attemptId: v.id("personalTestAttempts"),
  },
  returns: v.union(myAttemptResultsValidator, v.null()),
  handler: async (ctx, { attemptId }) => {
    await requireUser(ctx, { requireTech: true });
    const userId = await getUserIdOrThrow(ctx);
    return await loadMyPersonalTestAttemptResults(ctx, userId, attemptId);
  },
});
