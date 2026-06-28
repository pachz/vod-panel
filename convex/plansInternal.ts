import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  computePlanCourseStats,
  EMPTY_PLAN_COURSE_STATS,
  type PlanCourseStats,
} from "../shared/planFeatureTemplate";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

function isSubscriptionCurrentlyActive(
  sub: Pick<Doc<"subscriptions">, "status" | "currentPeriodEnd">,
  nowMs: number,
): boolean {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(sub.status) && sub.currentPeriodEnd >= nowMs;
}

/** Count distinct users with an active subscription on this plan (by planId or Stripe price). */
export async function countActiveSubscribersForPlan(
  ctx: QueryCtx | MutationCtx,
  plan: Pick<Doc<"subscriptionPlans">, "_id" | "stripePriceId">,
  nowMs: number,
): Promise<number> {
  const seen = new Set<Id<"subscriptions">>();
  let count = 0;

  const byPlan = await ctx.db
    .query("subscriptions")
    .withIndex("by_planId", (q) => q.eq("planId", plan._id))
    .collect();

  for (const sub of byPlan) {
    if (seen.has(sub._id)) continue;
    if (isSubscriptionCurrentlyActive(sub, nowMs)) {
      seen.add(sub._id);
      count += 1;
    }
  }

  const priceIds = new Set([plan.stripePriceId]);
  const history = await ctx.db
    .query("subscriptionPlanPriceHistory")
    .withIndex("by_planId", (q) => q.eq("planId", plan._id))
    .collect();
  for (const entry of history) {
    priceIds.add(entry.stripePriceId);
  }

  for (const stripePriceId of priceIds) {
    const byPrice = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripePriceId", (q) => q.eq("stripePriceId", stripePriceId))
      .collect();
    for (const sub of byPrice) {
      if (seen.has(sub._id)) continue;
      if (isSubscriptionCurrentlyActive(sub, nowMs)) {
        seen.add(sub._id);
        count += 1;
      }
    }
  }

  return count;
}

const planFeatureValidator = v.object({
  icon: v.string(),
  title: v.string(),
  title_ar: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  subtitle_ar: v.optional(v.string()),
  subtitleMode: v.optional(v.union(v.literal("manual"), v.literal("template"))),
  subtitleTemplate: v.optional(v.string()),
  subtitleTemplate_ar: v.optional(v.string()),
  isChecklistItem: v.boolean(),
  displayOrder: v.number(),
});

const planThemeValidator = v.object({
  primary: v.string(),
  secondary: v.string(),
  border: v.string(),
  headerBg: v.string(),
  buttonBg: v.string(),
});

export const planDocValidator = v.object({
  _id: v.id("subscriptionPlans"),
  _creationTime: v.number(),
  name: v.string(),
  name_ar: v.string(),
  slug: v.string(),
  titleIcon: v.optional(v.string()),
  billingInterval: v.union(v.literal("month"), v.literal("year")),
  stripeProductId: v.string(),
  stripePriceId: v.string(),
  priceAmount: v.number(),
  priceCurrency: v.string(),
  compareAtPriceAmount: v.optional(v.number()),
  priceSubtitle: v.optional(v.string()),
  priceSubtitle_ar: v.optional(v.string()),
  theme: planThemeValidator,
  badgeTag: v.union(
    v.literal("start_here"),
    v.literal("best_value"),
    v.literal("most_popular"),
    v.literal("limited"),
    v.literal("vip"),
    v.literal("none"),
  ),
  ribbonText: v.optional(v.string()),
  ribbonText_ar: v.optional(v.string()),
  inheritsDescription: v.optional(v.string()),
  inheritsDescription_ar: v.optional(v.string()),
  includesPlanId: v.optional(v.id("subscriptionPlans")),
  includeAllCourses: v.boolean(),
  includedCourseIds: v.array(v.id("courses")),
  includedCategoryIds: v.array(v.id("categories")),
  excludedCourseIds: v.optional(v.array(v.id("courses"))),
  resolvedCourseIds: v.array(v.id("courses")),
  courseStats: v.optional(
    v.object({
      courses: v.number(),
      lessons: v.number(),
      hours: v.number(),
    }),
  ),
  features: v.array(planFeatureValidator),
  displayOrder: v.number(),
  isActive: v.boolean(),
  isHidden: v.optional(v.boolean()),
  maxCapacity: v.optional(v.number()),
  updatedBy: v.id("users"),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
});

function isPublishedCourse(course: Doc<"courses">): boolean {
  return course.deletedAt === undefined && course.status === "published";
}

async function collectCoursesForCategories(
  ctx: QueryCtx | MutationCtx,
  categoryIds: Id<"categories">[],
): Promise<Set<Id<"courses">>> {
  const result = new Set<Id<"courses">>();
  if (categoryIds.length === 0) {
    return result;
  }

  const categorySet = new Set(categoryIds);

  for (const categoryId of categoryIds) {
    const byPrimary = await ctx.db
      .query("courses")
      .withIndex("deletedAt_category_status", (q) =>
        q.eq("deletedAt", undefined).eq("category_id", categoryId).eq("status", "published"),
      )
      .collect();
    for (const course of byPrimary) {
      result.add(course._id);
    }
  }

  const publishedCourses = await ctx.db
    .query("courses")
    .withIndex("deletedAt_status", (q) =>
      q.eq("deletedAt", undefined).eq("status", "published"),
    )
    .collect();

  for (const course of publishedCourses) {
    const additional = course.additional_category_ids ?? [];
    if (additional.some((id) => categorySet.has(id))) {
      result.add(course._id);
    }
  }

  return result;
}

async function collectAllPublishedCourses(ctx: QueryCtx | MutationCtx): Promise<Set<Id<"courses">>> {
  const result = new Set<Id<"courses">>();
  const courses = await ctx.db
    .query("courses")
    .withIndex("deletedAt_status", (q) =>
      q.eq("deletedAt", undefined).eq("status", "published"),
    )
    .collect();
  for (const course of courses) {
    result.add(course._id);
  }
  return result;
}

async function computeOwnCourseIds(
  ctx: QueryCtx | MutationCtx,
  plan: Pick<
    Doc<"subscriptionPlans">,
    "includeAllCourses" | "includedCourseIds" | "includedCategoryIds"
  >,
): Promise<Set<Id<"courses">>> {
  if (plan.includeAllCourses) {
    return collectAllPublishedCourses(ctx);
  }

  const result = new Set<Id<"courses">>();

  for (const courseId of plan.includedCourseIds) {
    const course = await ctx.db.get(courseId);
    if (course && isPublishedCourse(course)) {
      result.add(courseId);
    }
  }

  const fromCategories = await collectCoursesForCategories(ctx, plan.includedCategoryIds);
  for (const id of fromCategories) {
    result.add(id);
  }

  return result;
}

async function resolvePlanCourseIds(
  ctx: QueryCtx | MutationCtx,
  plan: Pick<
    Doc<"subscriptionPlans">,
    | "includeAllCourses"
    | "includedCourseIds"
    | "includedCategoryIds"
    | "excludedCourseIds"
  >,
): Promise<Id<"courses">[]> {
  const ownIds = await computeOwnCourseIds(ctx, plan);
  const excludeSet = new Set(plan.excludedCourseIds ?? []);
  return [...ownIds].filter((courseId) => !excludeSet.has(courseId)).sort();
}

type CoursePickerConfig = {
  includeAllCourses: boolean;
  includedCourseIds: Id<"courses">[];
  includedCategoryIds: Id<"categories">[];
  excludedCourseIds: Id<"courses">[];
};

async function resolveCourseIdsFromPicker(
  ctx: QueryCtx | MutationCtx,
  config: CoursePickerConfig,
): Promise<Id<"courses">[]> {
  return resolvePlanCourseIds(ctx, config);
}

export async function computePlanCourseStatsForIds(
  ctx: QueryCtx | MutationCtx,
  courseIds: Id<"courses">[],
): Promise<PlanCourseStats> {
  const courses: Array<{ duration?: number | null; lesson_count: number }> = [];
  for (const courseId of courseIds) {
    const course = await ctx.db.get(courseId);
    if (course && isPublishedCourse(course)) {
      courses.push(course);
    }
  }
  return computePlanCourseStats(courses);
}

export function getStoredPlanCourseStats(
  plan: Pick<Doc<"subscriptionPlans">, "courseStats" | "resolvedCourseIds">,
): PlanCourseStats {
  return plan.courseStats ?? EMPTY_PLAN_COURSE_STATS;
}

async function patchPlanResolution(
  ctx: MutationCtx,
  plan: Doc<"subscriptionPlans">,
): Promise<void> {
  const resolvedCourseIds = await resolvePlanCourseIds(ctx, plan);
  const courseStats = await computePlanCourseStatsForIds(ctx, resolvedCourseIds);
  await ctx.db.patch(plan._id, { resolvedCourseIds, courseStats });
}

async function patchPlanResolutionById(
  ctx: MutationCtx,
  planId: Id<"subscriptionPlans">,
): Promise<void> {
  const plan = await ctx.db.get(planId);
  if (!plan || plan.deletedAt !== undefined) {
    return;
  }
  await patchPlanResolution(ctx, plan);
}

export async function computePlanCourseStatsForPlan(
  ctx: QueryCtx | MutationCtx,
  plan: Doc<"subscriptionPlans">,
): Promise<PlanCourseStats> {
  const courseIds =
    plan.resolvedCourseIds.length > 0
      ? plan.resolvedCourseIds
      : await resolvePlanCourseIds(ctx, plan);
  return computePlanCourseStatsForIds(ctx, courseIds);
}

export { resolveCourseIdsFromPicker };

export type PlanCourseInclusionReason = "direct" | "category" | "all_courses";

export function getCourseInclusionReason(
  plan: Pick<
    Doc<"subscriptionPlans">,
    | "resolvedCourseIds"
    | "includeAllCourses"
    | "includedCourseIds"
    | "includedCategoryIds"
  >,
  courseId: Id<"courses">,
  courseCategoryIds: Id<"categories">[],
): PlanCourseInclusionReason | null {
  if (!plan.resolvedCourseIds.includes(courseId)) {
    return null;
  }
  if (plan.includeAllCourses) {
    return "all_courses";
  }
  if (plan.includedCourseIds.includes(courseId)) {
    return "direct";
  }
  if (plan.includedCategoryIds.some((id) => courseCategoryIds.includes(id))) {
    return "category";
  }
  return null;
}

export const addCourseToPlanRecord = internalMutation({
  args: {
    planId: v.id("subscriptionPlans"),
    courseId: v.id("courses"),
    updatedBy: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { planId, courseId, updatedBy }) => {
    const plan = await ctx.db.get(planId);
    if (!plan || plan.deletedAt !== undefined) {
      throw new Error("Plan not found.");
    }

    const course = await ctx.db.get(courseId);
    if (!course || course.deletedAt !== undefined || course.status !== "published") {
      throw new Error("Published course not found.");
    }

    if (plan.includeAllCourses || plan.includedCourseIds.includes(courseId)) {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(planId, {
      includedCourseIds: [...plan.includedCourseIds, courseId],
      updatedBy,
      updatedAt: now,
    });

    const updated = await ctx.db.get(planId);
    if (updated) {
      await patchPlanResolution(ctx, updated);
    }
    return null;
  },
});

export const removeCourseFromPlanRecord = internalMutation({
  args: {
    planId: v.id("subscriptionPlans"),
    courseId: v.id("courses"),
    updatedBy: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { planId, courseId, updatedBy }) => {
    const plan = await ctx.db.get(planId);
    if (!plan || plan.deletedAt !== undefined) {
      throw new Error("Plan not found.");
    }

    if (!plan.includedCourseIds.includes(courseId)) {
      throw new Error("Course is not directly selected on this plan.");
    }

    const now = Date.now();
    await ctx.db.patch(planId, {
      includedCourseIds: plan.includedCourseIds.filter((id) => id !== courseId),
      updatedBy,
      updatedAt: now,
    });

    const updated = await ctx.db.get(planId);
    if (updated) {
      await patchPlanResolution(ctx, updated);
    }
    return null;
  },
});

export const resolvePlanCourses = internalMutation({
  args: { planId: v.id("subscriptionPlans") },
  returns: v.null(),
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get(planId);
    if (!plan || plan.deletedAt !== undefined) {
      return null;
    }

    await patchPlanResolution(ctx, plan);
    return null;
  },
});

async function planNeedsRecomputeForCourse(
  plan: Doc<"subscriptionPlans">,
  courseId: Id<"courses">,
  categoryIds: Id<"categories">[],
): Promise<boolean> {
  if (plan.deletedAt !== undefined) {
    return false;
  }
  if (plan.includeAllCourses) {
    return true;
  }
  if (plan.includedCourseIds.includes(courseId)) {
    return true;
  }
  if ((plan.excludedCourseIds ?? []).includes(courseId)) {
    return true;
  }
  const categorySet = new Set(categoryIds);
  return plan.includedCategoryIds.some((id) => categorySet.has(id));
}

export const recomputePlansForCourse = internalMutation({
  args: { courseId: v.id("courses") },
  returns: v.null(),
  handler: async (ctx, { courseId }) => {
    const course = await ctx.db.get(courseId);
    const categoryIds: Id<"categories">[] = course
      ? [course.category_id, ...(course.additional_category_ids ?? [])]
      : [];

    const plans = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();

    const affectedPlanIds = new Set<Id<"subscriptionPlans">>();

    for (const plan of plans) {
      const needs =
        !course ||
        planNeedsRecomputeForCourse(plan, courseId, categoryIds) ||
        plan.resolvedCourseIds.includes(courseId);
      if (needs) {
        affectedPlanIds.add(plan._id);
      }
    }

    for (const planId of affectedPlanIds) {
      await patchPlanResolutionById(ctx, planId);
    }
    return null;
  },
});

export const recomputePlansForCategory = internalMutation({
  args: { categoryId: v.id("categories") },
  returns: v.null(),
  handler: async (ctx, { categoryId }) => {
    const plans = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();

    for (const plan of plans) {
      const affected =
        plan.includeAllCourses ||
        plan.includedCategoryIds.includes(categoryId);
      if (!affected) {
        continue;
      }
      await patchPlanResolution(ctx, plan);
    }
    return null;
  },
});

export const insertPlanRecord = internalMutation({
  args: {
    name: v.string(),
    name_ar: v.string(),
    slug: v.string(),
    titleIcon: v.optional(v.string()),
    billingInterval: v.union(v.literal("month"), v.literal("year")),
    stripeProductId: v.string(),
    stripePriceId: v.string(),
    priceAmount: v.number(),
    priceCurrency: v.string(),
    compareAtPriceAmount: v.optional(v.number()),
    priceSubtitle: v.optional(v.string()),
    priceSubtitle_ar: v.optional(v.string()),
    theme: planThemeValidator,
    badgeTag: v.union(
      v.literal("start_here"),
      v.literal("best_value"),
      v.literal("most_popular"),
      v.literal("limited"),
      v.literal("vip"),
      v.literal("none"),
    ),
    ribbonText: v.optional(v.string()),
    ribbonText_ar: v.optional(v.string()),
    inheritsDescription: v.optional(v.string()),
    inheritsDescription_ar: v.optional(v.string()),
    includeAllCourses: v.boolean(),
    includedCourseIds: v.array(v.id("courses")),
    includedCategoryIds: v.array(v.id("categories")),
    excludedCourseIds: v.optional(v.array(v.id("courses"))),
    features: v.array(planFeatureValidator),
    displayOrder: v.number(),
    isActive: v.boolean(),
    isHidden: v.optional(v.boolean()),
    maxCapacity: v.optional(v.number()),
    updatedBy: v.id("users"),
  },
  returns: v.id("subscriptionPlans"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const planId = await ctx.db.insert("subscriptionPlans", {
      ...args,
      resolvedCourseIds: [],
      courseStats: EMPTY_PLAN_COURSE_STATS,
      updatedAt: now,
    });

    const plan = await ctx.db.get(planId);
    if (plan) {
      await patchPlanResolution(ctx, plan);
    }

    return planId;
  },
});

export const patchPlanRecord = internalMutation({
  args: {
    planId: v.id("subscriptionPlans"),
    name: v.string(),
    name_ar: v.string(),
    slug: v.string(),
    titleIcon: v.optional(v.string()),
    compareAtPriceAmount: v.optional(v.number()),
    priceSubtitle: v.optional(v.string()),
    priceSubtitle_ar: v.optional(v.string()),
    theme: planThemeValidator,
    badgeTag: v.union(
      v.literal("start_here"),
      v.literal("best_value"),
      v.literal("most_popular"),
      v.literal("limited"),
      v.literal("vip"),
      v.literal("none"),
    ),
    ribbonText: v.optional(v.string()),
    ribbonText_ar: v.optional(v.string()),
    inheritsDescription: v.optional(v.string()),
    inheritsDescription_ar: v.optional(v.string()),
    includeAllCourses: v.boolean(),
    includedCourseIds: v.array(v.id("courses")),
    includedCategoryIds: v.array(v.id("categories")),
    excludedCourseIds: v.optional(v.array(v.id("courses"))),
    features: v.array(planFeatureValidator),
    displayOrder: v.number(),
    isActive: v.boolean(),
    isHidden: v.optional(v.boolean()),
    maxCapacity: v.optional(v.number()),
    updatedBy: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { planId, ...fields }) => {
    const now = Date.now();
    await ctx.db.patch(planId, { ...fields, updatedAt: now });

    const plan = await ctx.db.get(planId);
    if (plan && plan.deletedAt === undefined) {
      await patchPlanResolution(ctx, plan);
    }
    return null;
  },
});

export const recomputeAllPlanCourseStats = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const plans = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();

    for (const plan of plans) {
      await patchPlanResolution(ctx, plan);
    }
    return null;
  },
});

export const insertArchivedPriceHistory = internalMutation({
  args: {
    planId: v.id("subscriptionPlans"),
    stripePriceId: v.string(),
    priceAmount: v.number(),
    priceCurrency: v.string(),
    updatedBy: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("subscriptionPlanPriceHistory", {
      planId: args.planId,
      stripePriceId: args.stripePriceId,
      priceAmount: args.priceAmount,
      priceCurrency: args.priceCurrency,
      archivedAt: Date.now(),
      updatedBy: args.updatedBy,
    });
    return null;
  },
});

export const patchPlanPrice = internalMutation({
  args: {
    planId: v.id("subscriptionPlans"),
    stripePriceId: v.string(),
    priceAmount: v.number(),
    priceCurrency: v.string(),
    updatedBy: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.planId, {
      stripePriceId: args.stripePriceId,
      priceAmount: args.priceAmount,
      priceCurrency: args.priceCurrency,
      updatedBy: args.updatedBy,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const archivePlanRecord = internalMutation({
  args: {
    planId: v.id("subscriptionPlans"),
    updatedBy: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { planId, updatedBy }) => {
    const now = Date.now();
    await ctx.db.patch(planId, {
      deletedAt: now,
      isActive: false,
      updatedBy,
      updatedAt: now,
    });
    return null;
  },
});

export const validateNewPlanInternal = internalQuery({
  args: {
    slug: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { slug }) => {
    const existing = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();
    const conflict = existing.find((p) => p.deletedAt === undefined);
    if (conflict) {
      throw new Error("A plan with this slug already exists.");
    }
    return null;
  },
});

export const validatePlanUpdateInternal = internalQuery({
  args: {
    planId: v.id("subscriptionPlans"),
    slug: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { planId, slug }) => {
    const existing = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();
    const conflict = existing.find(
      (p) => p.deletedAt === undefined && p._id !== planId,
    );
    if (conflict) {
      throw new Error("A plan with this slug already exists.");
    }
    return null;
  },
});

export const getPlanByIdInternal = internalQuery({
  args: { planId: v.id("subscriptionPlans") },
  returns: v.union(planDocValidator, v.null()),
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      return null;
    }
    return plan;
  },
});

/** Resolve subscription plan from a Stripe price id (current or archived). */
export const resolvePlanFromStripePriceId = internalQuery({
  args: { stripePriceId: v.string() },
  returns: v.union(v.id("subscriptionPlans"), v.null()),
  handler: async (ctx, { stripePriceId }) => {
    const plans = await ctx.db.query("subscriptionPlans").collect();
    for (const plan of plans) {
      if (plan.deletedAt !== undefined) {
        continue;
      }
      if (plan.stripePriceId === stripePriceId) {
        return plan._id;
      }
    }

    const historyEntries = await ctx.db.query("subscriptionPlanPriceHistory").collect();
    for (const entry of historyEntries) {
      if (entry.stripePriceId === stripePriceId) {
        const plan = await ctx.db.get(entry.planId);
        if (plan && plan.deletedAt === undefined) {
          return plan._id;
        }
      }
    }

    return null;
  },
});

/** For plan checkout: whether the plan has reached its subscriber cap. */
export const getPlanCapacityStatus = internalQuery({
  args: { planId: v.id("subscriptionPlans") },
  returns: v.object({
    maxCapacity: v.union(v.number(), v.null()),
    activeSubscriberCount: v.number(),
    isAtCapacity: v.boolean(),
  }),
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get(planId);
    if (!plan || plan.deletedAt !== undefined) {
      return { maxCapacity: null, activeSubscriberCount: 0, isAtCapacity: true };
    }

    const nowMs = Date.now();
    const activeSubscriberCount = await countActiveSubscribersForPlan(ctx, plan, nowMs);
    const maxCapacity = plan.maxCapacity ?? null;
    const isAtCapacity = maxCapacity !== null && activeSubscriberCount >= maxCapacity;

    return { maxCapacity, activeSubscriberCount, isAtCapacity };
  },
});
