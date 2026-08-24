import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  personalTestCreateSchema,
  personalTestQuestionSchema,
  personalTestResultSchema,
  personalTestUpdateSchema,
  type PersonalTestCreateInput,
  type PersonalTestQuestionInput,
  type PersonalTestResultInput,
  type PersonalTestUpdateInput,
} from "../shared/validation/personalTest";
import { requireUser } from "./utils/auth";
import { computeRecommendedCourses } from "./lib/personalTestScoring";

const defaultResultSettings = {
  showAll: true,
  maxCourses: undefined as number | undefined,
};

const DEFAULT_DISPLAY_ORDER = 50;

function comparePersonalTestsByDisplayOrder(
  a: { displayOrder?: number; name: string; createdAt?: number },
  b: { displayOrder?: number; name: string; createdAt?: number },
) {
  const orderA = a.displayOrder ?? DEFAULT_DISPLAY_ORDER;
  const orderB = b.displayOrder ?? DEFAULT_DISPLAY_ORDER;
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  if (
    a.createdAt !== undefined &&
    b.createdAt !== undefined &&
    a.createdAt !== b.createdAt
  ) {
    return a.createdAt - b.createdAt;
  }
  return a.name.localeCompare(b.name);
}

const previewCourseResultValidator = v.object({
  _id: v.id("courses"),
  name: v.string(),
  name_ar: v.string(),
  thumbnail_image_url: v.optional(v.string()),
  short_description: v.optional(v.string()),
  short_description_ar: v.optional(v.string()),
});

function buildNameSearch(name: string, nameAr: string) {
  return `${name} ${nameAr}`.trim();
}

function validateCreateInput(input: PersonalTestCreateInput) {
  const result = personalTestCreateSchema.safeParse(input);
  if (!result.success) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: result.error.errors[0]?.message ?? "Invalid test input.",
    });
  }
  return result.data;
}

function validateUpdateInput(input: PersonalTestUpdateInput) {
  const result = personalTestUpdateSchema.safeParse(input);
  if (!result.success) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: result.error.errors[0]?.message ?? "Invalid test input.",
    });
  }
  if (!result.data.resultSettings.showAll && !result.data.resultSettings.maxCourses) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Enter a maximum number of courses or choose show all.",
    });
  }
  return result.data;
}

function validateQuestionInput(input: PersonalTestQuestionInput) {
  const result = personalTestQuestionSchema.safeParse(input);
  if (!result.success) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: result.error.errors[0]?.message ?? "Invalid question input.",
    });
  }
  return result.data;
}

function validateResultInput(input: PersonalTestResultInput) {
  const result = personalTestResultSchema.safeParse(input);
  if (!result.success) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: result.error.errors[0]?.message ?? "Invalid result input.",
    });
  }
  return result.data;
}

async function getTestOrThrow(
  ctx: QueryCtx | MutationCtx,
  testId: Id<"personalTests">,
) {
  const test = await ctx.db.get("personalTests", testId);
  if (!test || test.deletedAt !== undefined) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Test not found.",
    });
  }
  return test;
}

async function markUnpublishedChanges(
  ctx: MutationCtx,
  test: Doc<"personalTests">,
) {
  if (test.publishedSnapshot === undefined) {
    return;
  }

  const patch: {
    hasUnpublishedChanges: boolean;
    updatedAt: number;
    status?: "published" | "disabled";
  } = {
    hasUnpublishedChanges: true,
    updatedAt: Date.now(),
  };

  // Heal legacy rows that incorrectly reverted status to draft on edit.
  if (test.status === "draft") {
    patch.status = "published";
  }

  await ctx.db.patch(test._id, patch);
}

function resolveHasUnpublishedChanges(test: Doc<"personalTests">) {
  return (
    test.hasUnpublishedChanges === true ||
    (test.status === "draft" && test.publishedSnapshot !== undefined)
  );
}

async function loadQuestionsWithAnswers(
  ctx: QueryCtx | MutationCtx,
  testId: Id<"personalTests">,
) {
  const questions = await ctx.db
    .query("personalTestQuestions")
    .withIndex("by_testId_displayOrder", (q) => q.eq("testId", testId))
    .collect();

  return await Promise.all(
    questions.map(async (question) => {
      const answers = await ctx.db
        .query("personalTestAnswers")
        .withIndex("by_questionId", (q) => q.eq("questionId", question._id))
        .collect();
      answers.sort((a, b) => a.displayOrder - b.displayOrder);
      return { question, answers };
    }),
  );
}

async function loadResults(
  ctx: QueryCtx | MutationCtx,
  testId: Id<"personalTests">,
) {
  const results = await ctx.db
    .query("personalTestResults")
    .withIndex("by_testId_displayOrder", (q) => q.eq("testId", testId))
    .collect();
  return results;
}

async function loadCorrelations(
  ctx: QueryCtx | MutationCtx,
  testId: Id<"personalTests">,
) {
  return await ctx.db
    .query("personalTestResultCorrelations")
    .withIndex("by_testId", (q) => q.eq("testId", testId))
    .collect();
}

async function deleteCorrelationsForAnswer(
  ctx: MutationCtx,
  answerId: Id<"personalTestAnswers">,
) {
  const rows = await ctx.db
    .query("personalTestResultCorrelations")
    .withIndex("by_answerId", (q) => q.eq("answerId", answerId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete("personalTestResultCorrelations", row._id);
  }
}

async function deleteCorrelationsForQuestion(
  ctx: MutationCtx,
  questionId: Id<"personalTestQuestions">,
) {
  const rows = await ctx.db
    .query("personalTestResultCorrelations")
    .withIndex("by_questionId", (q) => q.eq("questionId", questionId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete("personalTestResultCorrelations", row._id);
  }
}

async function deleteCorrelationsForResult(
  ctx: MutationCtx,
  resultId: Id<"personalTestResults">,
) {
  const rows = await ctx.db
    .query("personalTestResultCorrelations")
    .withIndex("by_resultId", (q) => q.eq("resultId", resultId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete("personalTestResultCorrelations", row._id);
  }
}

async function deleteResultsForTest(
  ctx: MutationCtx,
  testId: Id<"personalTests">,
) {
  const correlations = await loadCorrelations(ctx, testId);
  for (const row of correlations) {
    await ctx.db.delete("personalTestResultCorrelations", row._id);
  }
  const results = await loadResults(ctx, testId);
  for (const result of results) {
    await ctx.db.delete("personalTestResults", result._id);
  }
}

async function buildSnapshot(ctx: MutationCtx, testId: Id<"personalTests">) {
  const test = await getTestOrThrow(ctx, testId);
  const qa = await loadQuestionsWithAnswers(ctx, testId);
  const results = await loadResults(ctx, testId);
  const correlations = await loadCorrelations(ctx, testId);

  return JSON.stringify({
    name: test.name,
    name_ar: test.name_ar,
    description: test.description,
    description_ar: test.description_ar,
    resultSettings: test.resultSettings,
    questions: qa.map(({ question, answers }) => ({
      id: question._id,
      title: question.title,
      title_ar: question.title_ar,
      answerType: question.answerType,
      displayOrder: question.displayOrder,
      answers: answers.map((answer) => ({
        id: answer._id,
        text: answer.text,
        text_ar: answer.text_ar,
        displayOrder: answer.displayOrder,
      })),
    })),
    results: results.map((result) => ({
      id: result._id,
      title: result.title,
      title_ar: result.title_ar,
      description: result.description,
      description_ar: result.description_ar,
      cover_image_url: result.cover_image_url,
      color: result.color,
      recommendedCourseIds: result.recommendedCourseIds ?? [],
      ctaText: result.ctaText,
      ctaText_ar: result.ctaText_ar,
      ctaUrl: result.ctaUrl,
      displayOrder: result.displayOrder,
    })),
    correlations: correlations.map((row) => ({
      questionId: row.questionId,
      answerId: row.answerId,
      resultId: row.resultId,
    })),
  });
}

async function recalculateQuestionCount(
  ctx: MutationCtx,
  testId: Id<"personalTests">,
) {
  const questions = await ctx.db
    .query("personalTestQuestions")
    .withIndex("by_testId", (q) => q.eq("testId", testId))
    .collect();
  await ctx.db.patch(testId, {
    questionCount: questions.length,
    updatedAt: Date.now(),
  });
}

async function validatePublishable(ctx: MutationCtx, testId: Id<"personalTests">) {
  const qa = await loadQuestionsWithAnswers(ctx, testId);
  if (qa.length === 0) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Add at least one question before publishing.",
    });
  }
  for (const { question, answers } of qa) {
    if (answers.length === 0) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: `Question "${question.title}" needs at least one answer.`,
      });
    }
  }
}

async function validateCourseIds(
  ctx: MutationCtx,
  courseIds: string[],
): Promise<Array<Id<"courses">>> {
  const unique = Array.from(new Set(courseIds));
  const result: Array<Id<"courses">> = [];
  for (const id of unique) {
    const course = await ctx.db.get("courses", id as Id<"courses">);
    if (course && course.deletedAt === undefined) {
      result.push(course._id);
    }
  }
  return result;
}

const questionValidator = v.object({
  _id: v.id("personalTestQuestions"),
  testId: v.id("personalTests"),
  title: v.string(),
  title_ar: v.string(),
  answerType: v.union(v.literal("single"), v.literal("multi")),
  displayOrder: v.number(),
  createdAt: v.number(),
});

const answerValidator = v.object({
  _id: v.id("personalTestAnswers"),
  testId: v.id("personalTests"),
  questionId: v.id("personalTestQuestions"),
  text: v.string(),
  text_ar: v.string(),
  resultIds: v.array(v.id("personalTestResults")),
  displayOrder: v.number(),
  createdAt: v.number(),
});

const resultValidator = v.object({
  _id: v.id("personalTestResults"),
  testId: v.id("personalTests"),
  title: v.string(),
  title_ar: v.string(),
  description: v.optional(v.string()),
  description_ar: v.optional(v.string()),
  cover_image_url: v.optional(v.string()),
  color: v.optional(v.string()),
  recommendedCourseIds: v.array(v.id("courses")),
  ctaText: v.optional(v.string()),
  ctaText_ar: v.optional(v.string()),
  ctaUrl: v.optional(v.string()),
  displayOrder: v.number(),
  createdAt: v.number(),
});

const testListItemValidator = v.object({
  _id: v.id("personalTests"),
  _creationTime: v.number(),
  name: v.string(),
  name_ar: v.string(),
  status: v.union(
    v.literal("draft"),
    v.literal("published"),
    v.literal("disabled"),
  ),
  displayOrder: v.number(),
  questionCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  hasPublishedSnapshot: v.boolean(),
  hasUnpublishedChanges: v.boolean(),
});

export const listPersonalTests = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("draft"), v.literal("published"), v.literal("disabled")),
    ),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    page: v.array(testListItemValidator),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { search, status, limit = 12, cursor }) => {
    await requireUser(ctx, { requireGodOrTech: true });

    const numItems = Math.min(Math.max(limit, 1), 100);

    if (search && search.trim().length > 0) {
      const results = await ctx.db
        .query("personalTests")
        .withSearchIndex("search_name", (q) => {
          let queryBuilder = q
            .search("name_search", search.trim())
            .eq("deletedAt", undefined);
          if (status) {
            queryBuilder = queryBuilder.eq("status", status);
          }
          return queryBuilder;
        })
        .paginate({ cursor: cursor ?? null, numItems });

      return {
        page: results.page
          .map((test) => ({
            _id: test._id,
            _creationTime: test._creationTime,
            name: test.name,
            name_ar: test.name_ar,
            status: test.status,
            displayOrder: test.displayOrder ?? DEFAULT_DISPLAY_ORDER,
            questionCount: test.questionCount,
            createdAt: test.createdAt,
            updatedAt: test.updatedAt,
            hasPublishedSnapshot: test.publishedSnapshot !== undefined,
            hasUnpublishedChanges: resolveHasUnpublishedChanges(test),
          }))
          .sort(comparePersonalTestsByDisplayOrder),
        isDone: results.isDone,
        continueCursor: results.continueCursor,
      };
    }

    const baseQuery =
      status !== undefined
        ? ctx.db
            .query("personalTests")
            .withIndex("by_deletedAt_status", (q) =>
              q.eq("deletedAt", undefined).eq("status", status),
            )
        : ctx.db
            .query("personalTests")
            .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined));

    const results = await baseQuery.order("desc").paginate({
      cursor: cursor ?? null,
      numItems,
    });

    return {
      page: results.page
        .map((test) => ({
          _id: test._id,
          _creationTime: test._creationTime,
          name: test.name,
          name_ar: test.name_ar,
          status: test.status,
          displayOrder: test.displayOrder ?? DEFAULT_DISPLAY_ORDER,
          questionCount: test.questionCount,
          createdAt: test.createdAt,
          updatedAt: test.updatedAt,
          hasPublishedSnapshot: test.publishedSnapshot !== undefined,
          hasUnpublishedChanges: resolveHasUnpublishedChanges(test),
        }))
        .sort(comparePersonalTestsByDisplayOrder),
      isDone: results.isDone,
      continueCursor: results.continueCursor,
    };
  },
});

export const getPersonalTest = query({
  args: { testId: v.id("personalTests") },
  returns: v.union(
    v.object({
      test: v.object({
        _id: v.id("personalTests"),
        _creationTime: v.number(),
        name: v.string(),
        name_ar: v.string(),
        description: v.optional(v.string()),
        description_ar: v.optional(v.string()),
        thumbnail_image_url: v.optional(v.string()),
        status: v.union(
          v.literal("draft"),
          v.literal("published"),
          v.literal("disabled"),
        ),
        displayOrder: v.number(),
        questionCount: v.number(),
        resultSettings: v.object({
          showAll: v.boolean(),
          maxCourses: v.optional(v.number()),
        }),
        publishedSnapshot: v.optional(v.string()),
        hasUnpublishedChanges: v.boolean(),
        createdAt: v.number(),
        updatedAt: v.number(),
      }),
      questions: v.array(
        v.object({
          question: questionValidator,
          answers: v.array(answerValidator),
        }),
      ),
      results: v.array(resultValidator),
      canPublish: v.boolean(),
      recommendedCourseIds: v.array(v.id("courses")),
    }),
    v.null(),
  ),
  handler: async (ctx, { testId }) => {
    await requireUser(ctx, { requireGodOrTech: true });

    const test = await ctx.db.get("personalTests", testId);
    if (!test || test.deletedAt !== undefined) {
      return null;
    }

    const qa = await loadQuestionsWithAnswers(ctx, testId);
    const results = await loadResults(ctx, testId);
    const correlations = await loadCorrelations(ctx, testId);
    const resultIdsByAnswer = new Map<Id<"personalTestAnswers">, Array<Id<"personalTestResults">>>();
    for (const row of correlations) {
      const existing = resultIdsByAnswer.get(row.answerId) ?? [];
      existing.push(row.resultId);
      resultIdsByAnswer.set(row.answerId, existing);
    }

    let canPublish = qa.length > 0;
    for (const { answers } of qa) {
      if (answers.length === 0) {
        canPublish = false;
        break;
      }
    }

    const courseIdSet = new Set<Id<"courses">>();
    for (const result of results) {
      for (const courseId of result.recommendedCourseIds ?? []) {
        courseIdSet.add(courseId);
      }
    }

    return {
      test: {
        _id: test._id,
        _creationTime: test._creationTime,
        name: test.name,
        name_ar: test.name_ar,
        description: test.description,
        description_ar: test.description_ar,
        thumbnail_image_url: test.thumbnail_image_url,
        status: test.status,
        displayOrder: test.displayOrder ?? DEFAULT_DISPLAY_ORDER,
        questionCount: test.questionCount,
        resultSettings: test.resultSettings,
        publishedSnapshot: test.publishedSnapshot,
        hasUnpublishedChanges: resolveHasUnpublishedChanges(test),
        createdAt: test.createdAt,
        updatedAt: test.updatedAt,
      },
      questions: qa.map(({ question, answers }) => ({
        question: {
          _id: question._id,
          testId: question.testId,
          title: question.title,
          title_ar: question.title_ar,
          answerType: question.answerType,
          displayOrder: question.displayOrder,
          createdAt: question.createdAt,
        },
        answers: answers.map((answer) => ({
          _id: answer._id,
          testId: answer.testId,
          questionId: answer.questionId,
          text: answer.text,
          text_ar: answer.text_ar,
          resultIds: resultIdsByAnswer.get(answer._id) ?? [],
          displayOrder: answer.displayOrder,
          createdAt: answer.createdAt,
        })),
      })),
      results: results.map((result) => ({
        _id: result._id,
        testId: result.testId,
        title: result.title,
        title_ar: result.title_ar,
        description: result.description,
        description_ar: result.description_ar,
        cover_image_url: result.cover_image_url,
        color: result.color,
        recommendedCourseIds: result.recommendedCourseIds ?? [],
        ctaText: result.ctaText,
        ctaText_ar: result.ctaText_ar,
        ctaUrl: result.ctaUrl,
        displayOrder: result.displayOrder,
        createdAt: result.createdAt,
      })),
      canPublish,
      recommendedCourseIds: Array.from(courseIdSet),
    };
  },
});

export const createPersonalTest = mutation({
  args: {
    name: v.string(),
    nameAr: v.string(),
  },
  returns: v.id("personalTests"),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const data = validateCreateInput(args);
    const now = Date.now();

    const existingTests = await ctx.db
      .query("personalTests")
      .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();
    const maxDisplayOrder = existingTests.reduce(
      (max, test) => Math.max(max, test.displayOrder ?? DEFAULT_DISPLAY_ORDER),
      -1,
    );

    return await ctx.db.insert("personalTests", {
      name: data.name,
      name_ar: data.nameAr,
      name_search: buildNameSearch(data.name, data.nameAr),
      status: "draft",
      displayOrder: maxDisplayOrder + 1,
      questionCount: 0,
      resultSettings: defaultResultSettings,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updatePersonalTest = mutation({
  args: {
    testId: v.id("personalTests"),
    name: v.string(),
    nameAr: v.string(),
    description: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
    displayOrder: v.number(),
    resultSettings: v.object({
      showAll: v.boolean(),
      maxCourses: v.optional(v.number()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const test = await getTestOrThrow(ctx, args.testId);
    const data = validateUpdateInput({
      name: args.name,
      nameAr: args.nameAr,
      description: args.description,
      descriptionAr: args.descriptionAr,
      displayOrder: args.displayOrder,
      resultSettings: args.resultSettings,
    });

    await markUnpublishedChanges(ctx, test);

    await ctx.db.patch(args.testId, {
      name: data.name,
      name_ar: data.nameAr,
      name_search: buildNameSearch(data.name, data.nameAr),
      description: data.description || undefined,
      description_ar: data.descriptionAr || undefined,
      displayOrder: data.displayOrder,
      resultSettings: data.resultSettings,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setPersonalTestEnabled = mutation({
  args: {
    testId: v.id("personalTests"),
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { testId, enabled }) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const test = await getTestOrThrow(ctx, testId);

    if (!test.publishedSnapshot) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Publish the test before changing availability.",
      });
    }

    await ctx.db.patch(testId, {
      status: enabled ? "published" : "disabled",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const publishPersonalTest = mutation({
  args: { testId: v.id("personalTests") },
  returns: v.null(),
  handler: async (ctx, { testId }) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const test = await getTestOrThrow(ctx, testId);
    await validatePublishable(ctx, testId);

    const snapshot = await buildSnapshot(ctx, testId);
    const patch: {
      publishedSnapshot: string;
      hasUnpublishedChanges: boolean;
      updatedAt: number;
      status?: "published";
    } = {
      publishedSnapshot: snapshot,
      hasUnpublishedChanges: false,
      updatedAt: Date.now(),
    };

    if (test.publishedSnapshot === undefined || test.status === "draft") {
      patch.status = "published";
    }

    await ctx.db.patch(testId, patch);
    return null;
  },
});

export const deletePersonalTest = mutation({
  args: { testId: v.id("personalTests") },
  returns: v.null(),
  handler: async (ctx, { testId }) => {
    await requireUser(ctx, { requireGodOrTech: true });
    await getTestOrThrow(ctx, testId);

    const questions = await ctx.db
      .query("personalTestQuestions")
      .withIndex("by_testId", (q) => q.eq("testId", testId))
      .collect();

    for (const question of questions) {
      const answers = await ctx.db
        .query("personalTestAnswers")
        .withIndex("by_questionId", (q) => q.eq("questionId", question._id))
        .collect();
      for (const answer of answers) {
        await ctx.db.delete("personalTestAnswers", answer._id);
      }
      await ctx.db.delete("personalTestQuestions", question._id);
    }

    await deleteResultsForTest(ctx, testId);

    await ctx.db.patch(testId, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const savePersonalTestQuestion = mutation({
  args: {
    testId: v.id("personalTests"),
    questionId: v.optional(v.id("personalTestQuestions")),
    title: v.string(),
    titleAr: v.string(),
    answerType: v.union(v.literal("single"), v.literal("multi")),
    answers: v.array(
      v.object({
        answerId: v.optional(v.id("personalTestAnswers")),
        text: v.string(),
        textAr: v.string(),
      }),
    ),
  },
  returns: v.id("personalTestQuestions"),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const test = await getTestOrThrow(ctx, args.testId);
    const data = validateQuestionInput({
      title: args.title,
      titleAr: args.titleAr,
      answerType: args.answerType,
      answers: args.answers.map((a) => ({
        text: a.text,
        textAr: a.textAr,
      })),
    });

    await markUnpublishedChanges(ctx, test);

    const validatedAnswers = data.answers.map((answer, index) => ({
      answerId: args.answers[index]?.answerId,
      text: answer.text,
      text_ar: answer.textAr,
    }));

    const now = Date.now();
    let questionId = args.questionId;

    if (questionId) {
      const existing = await ctx.db.get("personalTestQuestions", questionId);
      if (!existing || existing.testId !== args.testId) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Question not found.",
        });
      }

      await ctx.db.patch(questionId, {
        title: data.title,
        title_ar: data.titleAr,
        answerType: data.answerType,
      });

      const oldAnswers = await ctx.db
        .query("personalTestAnswers")
        .withIndex("by_questionId", (q) => q.eq("questionId", questionId!))
        .collect();
      const oldById = new Map(oldAnswers.map((answer) => [answer._id, answer]));
      const keptIds = new Set<Id<"personalTestAnswers">>();

      for (let i = 0; i < validatedAnswers.length; i++) {
        const answer = validatedAnswers[i]!;
        const existingAnswer =
          answer.answerId !== undefined ? oldById.get(answer.answerId) : undefined;
        if (existingAnswer && existingAnswer.questionId === questionId) {
          await ctx.db.patch(existingAnswer._id, {
            text: answer.text,
            text_ar: answer.text_ar,
            recommendedCourseIds: [],
            displayOrder: i,
          });
          keptIds.add(existingAnswer._id);
        } else {
          await ctx.db.insert("personalTestAnswers", {
            testId: args.testId,
            questionId,
            text: answer.text,
            text_ar: answer.text_ar,
            recommendedCourseIds: [],
            displayOrder: i,
            createdAt: now,
          });
        }
      }

      for (const oldAnswer of oldAnswers) {
        if (!keptIds.has(oldAnswer._id)) {
          await deleteCorrelationsForAnswer(ctx, oldAnswer._id);
          await ctx.db.delete("personalTestAnswers", oldAnswer._id);
        }
      }
    } else {
      const existingQuestions = await ctx.db
        .query("personalTestQuestions")
        .withIndex("by_testId", (q) => q.eq("testId", args.testId))
        .collect();
      const nextOrder =
        existingQuestions.length > 0
          ? Math.max(...existingQuestions.map((q) => q.displayOrder)) + 1
          : 0;

      questionId = await ctx.db.insert("personalTestQuestions", {
        testId: args.testId,
        title: data.title,
        title_ar: data.titleAr,
        answerType: data.answerType,
        displayOrder: nextOrder,
        createdAt: now,
      });

      for (let i = 0; i < validatedAnswers.length; i++) {
        const answer = validatedAnswers[i]!;
        await ctx.db.insert("personalTestAnswers", {
          testId: args.testId,
          questionId,
          text: answer.text,
          text_ar: answer.text_ar,
          recommendedCourseIds: [],
          displayOrder: i,
          createdAt: now,
        });
      }
    }

    await recalculateQuestionCount(ctx, args.testId);
    return questionId!;
  },
});

export const deletePersonalTestQuestion = mutation({
  args: {
    testId: v.id("personalTests"),
    questionId: v.id("personalTestQuestions"),
  },
  returns: v.null(),
  handler: async (ctx, { testId, questionId }) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const test = await getTestOrThrow(ctx, testId);
    const question = await ctx.db.get("personalTestQuestions", questionId);
    if (!question || question.testId !== testId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Question not found.",
      });
    }

    await markUnpublishedChanges(ctx, test);

    await deleteCorrelationsForQuestion(ctx, questionId);

    const answers = await ctx.db
      .query("personalTestAnswers")
      .withIndex("by_questionId", (q) => q.eq("questionId", questionId))
      .collect();
    for (const answer of answers) {
      await ctx.db.delete("personalTestAnswers", answer._id);
    }
    await ctx.db.delete("personalTestQuestions", questionId);

    const remaining = await ctx.db
      .query("personalTestQuestions")
      .withIndex("by_testId_displayOrder", (q) => q.eq("testId", testId))
      .collect();
    for (let i = 0; i < remaining.length; i++) {
      await ctx.db.patch(remaining[i]!._id, { displayOrder: i });
    }

    await recalculateQuestionCount(ctx, testId);
    return null;
  },
});

export const reorderPersonalTestQuestions = mutation({
  args: {
    testId: v.id("personalTests"),
    questionIds: v.array(v.id("personalTestQuestions")),
  },
  returns: v.null(),
  handler: async (ctx, { testId, questionIds }) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const test = await getTestOrThrow(ctx, testId);
    await markUnpublishedChanges(ctx, test);

    const questions = await ctx.db
      .query("personalTestQuestions")
      .withIndex("by_testId", (q) => q.eq("testId", testId))
      .collect();

    if (questionIds.length !== questions.length) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Invalid question order.",
      });
    }

    const questionIdSet = new Set(questions.map((q) => q._id));
    for (const id of questionIds) {
      if (!questionIdSet.has(id)) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Invalid question order.",
        });
      }
    }

    for (let i = 0; i < questionIds.length; i++) {
      await ctx.db.patch(questionIds[i]!, { displayOrder: i });
    }

    await ctx.db.patch(testId, { updatedAt: Date.now() });
    return null;
  },
});

type PublishedSnapshot = {
  name: string;
  name_ar: string;
  description?: string;
  description_ar?: string;
  resultSettings: { showAll: boolean; maxCourses?: number };
  questions: Array<{
    id: Id<"personalTestQuestions">;
    title: string;
    title_ar: string;
    answerType: "single" | "multi";
    displayOrder: number;
    answers: Array<{
      id: Id<"personalTestAnswers">;
      text: string;
      text_ar: string;
      displayOrder: number;
    }>;
  }>;
};

function parsePublishedSnapshot(snapshotJson: string): PublishedSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshotJson);
  } catch {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Published test data is invalid.",
    });
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Published test data is invalid.",
    });
  }

  return parsed as PublishedSnapshot;
}

const publishedTestListItemValidator = v.object({
  _id: v.id("personalTests"),
  name: v.string(),
  name_ar: v.string(),
  description: v.optional(v.string()),
  description_ar: v.optional(v.string()),
  thumbnail_image_url: v.optional(v.string()),
  questionCount: v.number(),
  displayOrder: v.number(),
});

const publishedTestQuestionValidator = v.object({
  question: v.object({
    _id: v.id("personalTestQuestions"),
    title: v.string(),
    title_ar: v.string(),
    answerType: v.union(v.literal("single"), v.literal("multi")),
    displayOrder: v.number(),
  }),
  answers: v.array(
    v.object({
      _id: v.id("personalTestAnswers"),
      text: v.string(),
      text_ar: v.string(),
    }),
  ),
});

export const previewPersonalTestResults = query({
  args: {
    testId: v.id("personalTests"),
    selectedAnswerIds: v.array(v.id("personalTestAnswers")),
  },
  returns: v.object({
    courses: v.array(previewCourseResultValidator),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const test = await getTestOrThrow(ctx, args.testId);
    const { courses } = await computeRecommendedCourses(
      ctx,
      args.testId,
      args.selectedAnswerIds,
      test.resultSettings,
    );
    return { courses };
  },
});

export const listPublishedPersonalTests = query({
  args: {
    search: v.optional(v.string()),
  },
  returns: v.array(publishedTestListItemValidator),
  handler: async (ctx, { search }) => {
    await requireUser(ctx);

    if (search && search.trim().length > 0) {
      const results = await ctx.db
        .query("personalTests")
        .withSearchIndex("search_name", (q) =>
          q
            .search("name_search", search.trim())
            .eq("deletedAt", undefined)
            .eq("status", "published"),
        )
        .take(50);

      return results
        .map((test) => ({
          _id: test._id,
          name: test.name,
          name_ar: test.name_ar,
          description: test.description,
          description_ar: test.description_ar,
          thumbnail_image_url: test.thumbnail_image_url,
          questionCount: test.questionCount,
          displayOrder: test.displayOrder ?? DEFAULT_DISPLAY_ORDER,
        }))
        .sort(comparePersonalTestsByDisplayOrder);
    }

    const tests = await ctx.db
      .query("personalTests")
      .withIndex("by_deletedAt_status", (q) =>
        q.eq("deletedAt", undefined).eq("status", "published"),
      )
      .order("desc")
      .take(50);

    return tests
      .map((test) => ({
        _id: test._id,
        name: test.name,
        name_ar: test.name_ar,
        description: test.description,
        description_ar: test.description_ar,
        thumbnail_image_url: test.thumbnail_image_url,
        questionCount: test.questionCount,
        displayOrder: test.displayOrder ?? DEFAULT_DISPLAY_ORDER,
      }))
      .sort(comparePersonalTestsByDisplayOrder);
  },
});

export const savePersonalTestResult = mutation({
  args: {
    testId: v.id("personalTests"),
    resultId: v.optional(v.id("personalTestResults")),
    title: v.string(),
    titleAr: v.string(),
    description: v.optional(v.string()),
    descriptionAr: v.optional(v.string()),
    color: v.optional(v.string()),
    recommendedCourseIds: v.array(v.id("courses")),
    ctaEnabled: v.boolean(),
    ctaText: v.optional(v.string()),
    ctaTextAr: v.optional(v.string()),
    ctaUrl: v.optional(v.string()),
    coverStorageId: v.optional(v.id("_storage")),
    clearCover: v.optional(v.boolean()),
  },
  returns: v.id("personalTestResults"),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const test = await getTestOrThrow(ctx, args.testId);
    const data = validateResultInput({
      title: args.title,
      titleAr: args.titleAr,
      description: args.description,
      descriptionAr: args.descriptionAr,
      color: args.color,
      recommendedCourseIds: args.recommendedCourseIds.map(String),
      ctaEnabled: args.ctaEnabled,
      ctaText: args.ctaText,
      ctaTextAr: args.ctaTextAr,
      ctaUrl: args.ctaUrl,
    });
    const recommendedCourseIds = await validateCourseIds(
      ctx,
      data.recommendedCourseIds,
    );

    await markUnpublishedChanges(ctx, test);

    let coverUrl: string | undefined;
    if (args.resultId) {
      const existing = await ctx.db.get("personalTestResults", args.resultId);
      if (!existing || existing.testId !== args.testId) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Result not found.",
        });
      }
      coverUrl = existing.cover_image_url;
    }
    if (args.clearCover) {
      coverUrl = undefined;
    }
    if (args.coverStorageId) {
      const url = await ctx.storage.getUrl(args.coverStorageId);
      if (!url) {
        throw new ConvexError({
          code: "STORAGE_ERROR",
          message: "Could not generate cover image URL.",
        });
      }
      coverUrl = url;
    }

    const fields = {
      testId: args.testId,
      title: data.title,
      title_ar: data.titleAr,
      ...(data.description ? { description: data.description } : {}),
      ...(data.descriptionAr ? { description_ar: data.descriptionAr } : {}),
      ...(data.color ? { color: data.color } : {}),
      recommendedCourseIds,
      ...(coverUrl ? { cover_image_url: coverUrl } : {}),
      ...(data.ctaEnabled
        ? {
            ctaText: data.ctaText,
            ctaText_ar: data.ctaTextAr,
            ctaUrl: data.ctaUrl,
          }
        : {}),
    };

    if (args.resultId) {
      const existing = await ctx.db.get("personalTestResults", args.resultId);
      if (!existing || existing.testId !== args.testId) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Result not found.",
        });
      }
      await ctx.db.replace(args.resultId, {
        ...fields,
        displayOrder: existing.displayOrder,
        createdAt: existing.createdAt,
      });
      return args.resultId;
    }

    const existingResults = await loadResults(ctx, args.testId);
    const nextOrder =
      existingResults.length > 0
        ? Math.max(...existingResults.map((result) => result.displayOrder)) + 1
        : 0;

    return await ctx.db.insert("personalTestResults", {
      ...fields,
      displayOrder: nextOrder,
      createdAt: Date.now(),
    });
  },
});

export const deletePersonalTestResult = mutation({
  args: {
    testId: v.id("personalTests"),
    resultId: v.id("personalTestResults"),
  },
  returns: v.null(),
  handler: async (ctx, { testId, resultId }) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const test = await getTestOrThrow(ctx, testId);
    const result = await ctx.db.get("personalTestResults", resultId);
    if (!result || result.testId !== testId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Result not found.",
      });
    }

    await markUnpublishedChanges(ctx, test);
    await deleteCorrelationsForResult(ctx, resultId);
    await ctx.db.delete("personalTestResults", resultId);

    const remaining = await loadResults(ctx, testId);
    for (let i = 0; i < remaining.length; i++) {
      await ctx.db.patch(remaining[i]!._id, { displayOrder: i });
    }
    return null;
  },
});

export const savePersonalTestQuestionResultCorrelations = mutation({
  args: {
    testId: v.id("personalTests"),
    questionId: v.id("personalTestQuestions"),
    mappings: v.array(
      v.object({
        answerId: v.id("personalTestAnswers"),
        resultIds: v.array(v.id("personalTestResults")),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { testId, questionId, mappings }) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const test = await getTestOrThrow(ctx, testId);
    const question = await ctx.db.get("personalTestQuestions", questionId);
    if (!question || question.testId !== testId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Question not found.",
      });
    }

    const answers = await ctx.db
      .query("personalTestAnswers")
      .withIndex("by_questionId", (q) => q.eq("questionId", questionId))
      .collect();
    const answerIds = new Set(answers.map((answer) => answer._id));
    const results = await loadResults(ctx, testId);
    const resultIds = new Set(results.map((result) => result._id));

    for (const mapping of mappings) {
      if (!answerIds.has(mapping.answerId)) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Answer does not belong to this question.",
        });
      }
      for (const resultId of mapping.resultIds) {
        if (!resultIds.has(resultId)) {
          throw new ConvexError({
            code: "INVALID_INPUT",
            message: "Result does not belong to this test.",
          });
        }
      }
    }

    await markUnpublishedChanges(ctx, test);
    await deleteCorrelationsForQuestion(ctx, questionId);

    for (const mapping of mappings) {
      const uniqueResultIds = Array.from(new Set(mapping.resultIds));
      for (const resultId of uniqueResultIds) {
        await ctx.db.insert("personalTestResultCorrelations", {
          testId,
          questionId,
          answerId: mapping.answerId,
          resultId,
        });
      }
    }

    return null;
  },
});

export const generatePersonalTestImageUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx, { requireGodOrTech: true });
    return await ctx.storage.generateUploadUrl();
  },
});

export const updatePersonalTestThumbnail = mutation({
  args: {
    testId: v.id("personalTests"),
    thumbnailStorageId: v.id("_storage"),
  },
  returns: v.object({
    thumbnailImageUrl: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const test = await getTestOrThrow(ctx, args.testId);

    const url = await ctx.storage.getUrl(args.thumbnailStorageId);
    if (!url) {
      throw new ConvexError({
        code: "STORAGE_ERROR",
        message: "Could not generate thumbnail image URL.",
      });
    }

    await markUnpublishedChanges(ctx, test);

    await ctx.db.patch(args.testId, {
      thumbnail_image_url: url,
      updatedAt: Date.now(),
    });

    return { thumbnailImageUrl: url };
  },
});

export const getPublishedPersonalTest = query({
  args: { testId: v.id("personalTests") },
  returns: v.union(
    v.object({
      test: v.object({
        _id: v.id("personalTests"),
        name: v.string(),
        name_ar: v.string(),
        description: v.optional(v.string()),
        description_ar: v.optional(v.string()),
        questionCount: v.number(),
      }),
      questions: v.array(publishedTestQuestionValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, { testId }) => {
    await requireUser(ctx);

    const test = await ctx.db.get("personalTests", testId);
    if (
      !test ||
      test.deletedAt !== undefined ||
      test.status !== "published" ||
      !test.publishedSnapshot
    ) {
      return null;
    }

    const snapshot = parsePublishedSnapshot(test.publishedSnapshot);
    const questions = [...snapshot.questions]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((question) => ({
        question: {
          _id: question.id,
          title: question.title,
          title_ar: question.title_ar,
          answerType: question.answerType,
          displayOrder: question.displayOrder,
        },
        answers: [...question.answers]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((answer) => ({
            _id: answer.id,
            text: answer.text,
            text_ar: answer.text_ar,
          })),
      }));

    return {
      test: {
        _id: test._id,
        name: snapshot.name,
        name_ar: snapshot.name_ar,
        description: snapshot.description ?? test.description,
        description_ar: snapshot.description_ar ?? test.description_ar,
        questionCount: questions.length,
      },
      questions,
    };
  },
});

export const computePersonalTestResults = query({
  args: {
    testId: v.id("personalTests"),
    selectedAnswerIds: v.array(v.id("personalTestAnswers")),
  },
  returns: v.object({
    courseIds: v.array(v.id("courses")),
    courses: v.array(
      v.object({
        _id: v.id("courses"),
        name: v.string(),
        name_ar: v.string(),
        thumbnail_image_url: v.optional(v.string()),
        short_description: v.optional(v.string()),
        short_description_ar: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, { testId, selectedAnswerIds }) => {
    await requireUser(ctx);
    const test = await getTestOrThrow(ctx, testId);
    return await computeRecommendedCourses(
      ctx,
      testId,
      selectedAnswerIds,
      test.resultSettings,
    );
  },
});
