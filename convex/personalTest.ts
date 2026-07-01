import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  personalTestCreateSchema,
  personalTestQuestionSchema,
  personalTestUpdateSchema,
  type PersonalTestCreateInput,
  type PersonalTestQuestionInput,
  type PersonalTestUpdateInput,
} from "../shared/validation/personalTest";
import { requireUser } from "./utils/auth";

const defaultResultSettings = {
  showAll: true,
  maxCourses: undefined as number | undefined,
};

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

async function buildSnapshot(ctx: MutationCtx, testId: Id<"personalTests">) {
  const test = await getTestOrThrow(ctx, testId);
  const qa = await loadQuestionsWithAnswers(ctx, testId);

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
        recommendedCourseIds: answer.recommendedCourseIds,
        displayOrder: answer.displayOrder,
      })),
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
  recommendedCourseIds: v.array(v.id("courses")),
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
    await requireUser(ctx, { requireTech: true });

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
        page: results.page.map((test) => ({
          _id: test._id,
          _creationTime: test._creationTime,
          name: test.name,
          name_ar: test.name_ar,
          status: test.status,
          questionCount: test.questionCount,
          createdAt: test.createdAt,
          updatedAt: test.updatedAt,
          hasPublishedSnapshot: test.publishedSnapshot !== undefined,
          hasUnpublishedChanges: resolveHasUnpublishedChanges(test),
        })),
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
      page: results.page.map((test) => ({
        _id: test._id,
        _creationTime: test._creationTime,
        name: test.name,
        name_ar: test.name_ar,
        status: test.status,
        questionCount: test.questionCount,
        createdAt: test.createdAt,
        updatedAt: test.updatedAt,
        hasPublishedSnapshot: test.publishedSnapshot !== undefined,
        hasUnpublishedChanges: resolveHasUnpublishedChanges(test),
      })),
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
        status: v.union(
          v.literal("draft"),
          v.literal("published"),
          v.literal("disabled"),
        ),
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
      canPublish: v.boolean(),
      recommendedCourseIds: v.array(v.id("courses")),
    }),
    v.null(),
  ),
  handler: async (ctx, { testId }) => {
    await requireUser(ctx, { requireTech: true });

    const test = await ctx.db.get("personalTests", testId);
    if (!test || test.deletedAt !== undefined) {
      return null;
    }

    const qa = await loadQuestionsWithAnswers(ctx, testId);
    let canPublish = qa.length > 0;
    for (const { answers } of qa) {
      if (answers.length === 0) {
        canPublish = false;
        break;
      }
    }

    const courseIdSet = new Set<Id<"courses">>();
    for (const { answers } of qa) {
      for (const answer of answers) {
        for (const courseId of answer.recommendedCourseIds) {
          courseIdSet.add(courseId);
        }
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
        status: test.status,
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
          recommendedCourseIds: answer.recommendedCourseIds,
          displayOrder: answer.displayOrder,
          createdAt: answer.createdAt,
        })),
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
    await requireUser(ctx, { requireTech: true });
    const data = validateCreateInput(args);
    const now = Date.now();

    return await ctx.db.insert("personalTests", {
      name: data.name,
      name_ar: data.nameAr,
      name_search: buildNameSearch(data.name, data.nameAr),
      status: "draft",
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
    resultSettings: v.object({
      showAll: v.boolean(),
      maxCourses: v.optional(v.number()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });
    const test = await getTestOrThrow(ctx, args.testId);
    const data = validateUpdateInput({
      name: args.name,
      nameAr: args.nameAr,
      description: args.description,
      descriptionAr: args.descriptionAr,
      resultSettings: args.resultSettings,
    });

    await markUnpublishedChanges(ctx, test);

    await ctx.db.patch(args.testId, {
      name: data.name,
      name_ar: data.nameAr,
      name_search: buildNameSearch(data.name, data.nameAr),
      description: data.description || undefined,
      description_ar: data.descriptionAr || undefined,
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
    await requireUser(ctx, { requireTech: true });
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
    await requireUser(ctx, { requireTech: true });
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
    await requireUser(ctx, { requireTech: true });
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
        text: v.string(),
        textAr: v.string(),
        recommendedCourseIds: v.array(v.id("courses")),
      }),
    ),
  },
  returns: v.id("personalTestQuestions"),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });
    const test = await getTestOrThrow(ctx, args.testId);
    const data = validateQuestionInput({
      title: args.title,
      titleAr: args.titleAr,
      answerType: args.answerType,
      answers: args.answers.map((a) => ({
        text: a.text,
        textAr: a.textAr,
        recommendedCourseIds: a.recommendedCourseIds.map(String),
      })),
    });

    await markUnpublishedChanges(ctx, test);

    const validatedAnswers = await Promise.all(
      data.answers.map(async (answer) => ({
        text: answer.text,
        text_ar: answer.textAr,
        recommendedCourseIds: await validateCourseIds(
          ctx,
          answer.recommendedCourseIds,
        ),
      })),
    );

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
      for (const answer of oldAnswers) {
        await ctx.db.delete("personalTestAnswers", answer._id);
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
    }

    for (let i = 0; i < validatedAnswers.length; i++) {
      const answer = validatedAnswers[i]!;
      await ctx.db.insert("personalTestAnswers", {
        testId: args.testId,
        questionId: questionId!,
        text: answer.text,
        text_ar: answer.text_ar,
        recommendedCourseIds: answer.recommendedCourseIds,
        displayOrder: i,
        createdAt: now,
      });
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
    await requireUser(ctx, { requireTech: true });
    const test = await getTestOrThrow(ctx, testId);
    const question = await ctx.db.get("personalTestQuestions", questionId);
    if (!question || question.testId !== testId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Question not found.",
      });
    }

    await markUnpublishedChanges(ctx, test);

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
    await requireUser(ctx, { requireTech: true });
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
      }),
    ),
  }),
  handler: async (ctx, { testId, selectedAnswerIds }) => {
    await requireUser(ctx, { requireTech: true });
    const test = await getTestOrThrow(ctx, testId);

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
    if (!test.resultSettings.showAll && test.resultSettings.maxCourses) {
      ranked = ranked.slice(0, test.resultSettings.maxCourses);
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
  },
});
