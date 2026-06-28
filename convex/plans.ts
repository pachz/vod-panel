import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { requireUser } from "./utils/auth";
import {
  planPriceUpdateSchema,
  planUpdateInputSchema,
  type PlanFeature,
} from "../shared/validation/plan";
import { formatPlanValidationMessage } from "../shared/validation/planFormValidation";
import {
  countActiveSubscribersForPlan,
  getCourseInclusionReason,
  getStoredPlanCourseStats,
} from "./plansInternal";
import {
  resolvePlanFeaturesForDisplay,
  type PlanCourseStats,
} from "../shared/planFeatureTemplate";

const planThemeValidator = v.object({
  primary: v.string(),
  secondary: v.string(),
  border: v.string(),
  headerBg: v.string(),
  buttonBg: v.string(),
});

const planDocValidator = v.object({
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
  features: v.array(
    v.object({
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
    }),
  ),
  displayOrder: v.number(),
  isActive: v.boolean(),
  isHidden: v.optional(v.boolean()),
  maxCapacity: v.optional(v.number()),
  updatedBy: v.id("users"),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
});

const planFeatureInputValidator = v.object({
  icon: v.string(),
  title: v.string(),
  titleAr: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  subtitleAr: v.optional(v.string()),
  subtitleMode: v.optional(v.union(v.literal("manual"), v.literal("template"))),
  subtitleTemplate: v.optional(v.string()),
  subtitleTemplateAr: v.optional(v.string()),
  isChecklistItem: v.boolean(),
  displayOrder: v.number(),
});

function mapFeatures(features: PlanFeature[]) {
  return features.map((f) => ({
    icon: f.icon,
    title: f.title,
    title_ar: f.titleAr,
    subtitle: f.subtitle,
    subtitle_ar: f.subtitleAr,
    subtitleMode: f.subtitleMode,
    subtitleTemplate: f.subtitleTemplate,
    subtitleTemplate_ar: f.subtitleTemplateAr,
    isChecklistItem: f.isChecklistItem,
    displayOrder: f.displayOrder,
  }));
}

function resolveStoredFeatures(
  features: Doc<"subscriptionPlans">["features"],
  stats: PlanCourseStats,
) {
  const resolved = resolvePlanFeaturesForDisplay(
    features.map((f) => ({
      icon: f.icon,
      title: f.title,
      title_ar: f.title_ar,
      subtitle: f.subtitle,
      subtitleAr: f.subtitle_ar,
      subtitleMode: f.subtitleMode,
      subtitleTemplate: f.subtitleTemplate,
      subtitleTemplateAr: f.subtitleTemplate_ar,
      isChecklistItem: f.isChecklistItem,
      displayOrder: f.displayOrder,
    })),
    stats,
  );

  return resolved.map((f) => ({
    icon: f.icon,
    title: f.title,
    title_ar: f.title_ar,
    subtitle: f.subtitle,
    subtitle_ar: f.subtitle_ar,
    subtitleMode: f.subtitleMode,
    subtitleTemplate: f.subtitleTemplate,
    subtitleTemplate_ar: f.subtitleTemplateAr,
    isChecklistItem: f.isChecklistItem,
    displayOrder: f.displayOrder,
  }));
}

async function assertUniqueSlug(
  ctx: MutationCtx,
  slug: string,
  excludeId?: Id<"subscriptionPlans">,
): Promise<void> {
  const existing = await ctx.db
    .query("subscriptionPlans")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .collect();

  const conflict = existing.find(
    (p) => p.deletedAt === undefined && p._id !== excludeId,
  );
  if (conflict) {
    throw new ConvexError({
      code: "SLUG_EXISTS",
      message: "A plan with this slug already exists.",
    });
  }
}

const planListItemValidator = v.object({
  _id: v.id("subscriptionPlans"),
  name: v.string(),
  name_ar: v.string(),
  slug: v.string(),
  titleIcon: v.optional(v.string()),
  billingInterval: v.union(v.literal("month"), v.literal("year")),
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
  features: v.array(
    v.object({
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
    }),
  ),
  displayOrder: v.number(),
  isActive: v.boolean(),
  isHidden: v.optional(v.boolean()),
  resolvedCourseCount: v.number(),
  activeSubscriberCount: v.number(),
  maxCapacity: v.optional(v.number()),
});

export const listPlans = query({
  args: {
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(planListItemValidator),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });

    const plans = await ctx.db.query("subscriptionPlans").collect();
    const filtered = plans
      .filter((p) => (args.includeArchived ? true : p.deletedAt === undefined))
      .sort((a, b) => a.displayOrder - b.displayOrder);

    const result = [];
    const nowMs = Date.now();
    for (const plan of filtered) {
      const activeSubscriberCount = await countActiveSubscribersForPlan(ctx, plan, nowMs);
      const courseStats = getStoredPlanCourseStats(plan);
      result.push({
        _id: plan._id,
        name: plan.name,
        name_ar: plan.name_ar,
        slug: plan.slug,
        titleIcon: plan.titleIcon,
        billingInterval: plan.billingInterval,
        priceAmount: plan.priceAmount,
        priceCurrency: plan.priceCurrency,
        compareAtPriceAmount: plan.compareAtPriceAmount,
        priceSubtitle: plan.priceSubtitle,
        priceSubtitle_ar: plan.priceSubtitle_ar,
        theme: plan.theme,
        badgeTag: plan.badgeTag,
        ribbonText: plan.ribbonText,
        ribbonText_ar: plan.ribbonText_ar,
        inheritsDescription: plan.inheritsDescription,
        inheritsDescription_ar: plan.inheritsDescription_ar,
        features: resolveStoredFeatures(plan.features, courseStats),
        displayOrder: plan.displayOrder,
        isActive: plan.isActive,
        isHidden: plan.isHidden === true,
        resolvedCourseCount: plan.resolvedCourseIds.length,
        activeSubscriberCount,
        maxCapacity: plan.maxCapacity,
      });
    }
    return result;
  },
});

const adminGrantPlanOptionValidator = v.object({
  _id: v.id("subscriptionPlans"),
  name: v.string(),
  name_ar: v.string(),
  billingInterval: v.union(v.literal("month"), v.literal("year")),
  priceAmount: v.number(),
  priceCurrency: v.string(),
  isHidden: v.boolean(),
  isActive: v.boolean(),
});

/** All non-archived plans for admin grant (includes hidden and inactive). */
export const listPlansForAdminGrant = query({
  args: {},
  returns: v.array(adminGrantPlanOptionValidator),
  handler: async (ctx) => {
    await requireUser(ctx, { requireGod: true });

    const plans = await ctx.db.query("subscriptionPlans").collect();
    return plans
      .filter((plan) => plan.deletedAt === undefined)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((plan) => ({
        _id: plan._id,
        name: plan.name,
        name_ar: plan.name_ar,
        billingInterval: plan.billingInterval,
        priceAmount: plan.priceAmount,
        priceCurrency: plan.priceCurrency,
        isHidden: plan.isHidden === true,
        isActive: plan.isActive,
      }));
  },
});

const planDetailValidator = v.object({
  plan: planDocValidator,
  activeSubscriberCount: v.number(),
  courseStats: v.object({
    courses: v.number(),
    lessons: v.number(),
    hours: v.number(),
  }),
  resolvedCourses: v.array(
    v.object({
      _id: v.id("courses"),
      name: v.string(),
      name_ar: v.string(),
    }),
  ),
});

export const getPlan = query({
  args: { planId: v.id("subscriptionPlans") },
  returns: v.union(planDetailValidator, v.null()),
  handler: async (ctx, { planId }) => {
    await requireUser(ctx, { requireTech: true });

    const plan = await ctx.db.get(planId);
    if (!plan) {
      return null;
    }

    const resolvedCourses = [];
    for (const courseId of plan.resolvedCourseIds) {
      const course = await ctx.db.get(courseId);
      if (course) {
        resolvedCourses.push({
          _id: course._id,
          name: course.name,
          name_ar: course.name_ar,
        });
      }
    }

    return {
      plan,
      activeSubscriberCount: await countActiveSubscribersForPlan(ctx, plan, Date.now()),
      courseStats: getStoredPlanCourseStats(plan),
      resolvedCourses,
    };
  },
});

export const listCoursesForPicker = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("courses"),
      name: v.string(),
      name_ar: v.string(),
      category_id: v.id("categories"),
      additional_category_ids: v.optional(v.array(v.id("categories"))),
      duration: v.optional(v.number()),
      lesson_count: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireUser(ctx, { requireTech: true });

    const courses = await ctx.db
      .query("courses")
      .withIndex("deletedAt_status", (q) =>
        q.eq("deletedAt", undefined).eq("status", "published"),
      )
      .collect();

    return courses
      .map((c) => ({
        _id: c._id,
        name: c.name,
        name_ar: c.name_ar,
        category_id: c.category_id,
        additional_category_ids: c.additional_category_ids,
        duration: c.duration,
        lesson_count: c.lesson_count,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listCategoriesForPicker = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("categories"),
      name: v.string(),
      name_ar: v.string(),
    }),
  ),
  handler: async (ctx) => {
    await requireUser(ctx, { requireTech: true });

    const categories = await ctx.db.query("categories").collect();
    return categories
      .filter((c) => c.deletedAt === undefined)
      .map((c) => ({ _id: c._id, name: c.name, name_ar: c.name_ar }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

const planCourseInclusionValidator = v.union(
  v.literal("direct"),
  v.literal("category"),
  v.literal("all_courses"),
);

export const getCoursePlanMembership = query({
  args: { courseId: v.id("courses") },
  returns: v.object({
    includingPlans: v.array(
      v.object({
        _id: v.id("subscriptionPlans"),
        name: v.string(),
        slug: v.string(),
        billingInterval: v.union(v.literal("month"), v.literal("year")),
        isActive: v.boolean(),
        inclusion: planCourseInclusionValidator,
        canRemove: v.boolean(),
      }),
    ),
    addablePlans: v.array(
      v.object({
        _id: v.id("subscriptionPlans"),
        name: v.string(),
      }),
    ),
  }),
  handler: async (ctx, { courseId }) => {
    await requireUser(ctx, { requireTech: true });

    const course = await ctx.db.get(courseId);
    if (!course || course.deletedAt !== undefined) {
      return { includingPlans: [], addablePlans: [] };
    }

    const courseCategoryIds = [
      course.category_id,
      ...(course.additional_category_ids ?? []),
    ];

    const plans = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();

    const includingPlans = [];
    const addablePlans = [];

    for (const plan of plans) {
      const inclusion = getCourseInclusionReason(plan, courseId, courseCategoryIds);
      if (inclusion) {
        includingPlans.push({
          _id: plan._id,
          name: plan.name,
          slug: plan.slug,
          billingInterval: plan.billingInterval,
          isActive: plan.isActive,
          inclusion,
          canRemove: inclusion === "direct",
        });
      } else {
        addablePlans.push({
          _id: plan._id,
          name: plan.name,
        });
      }
    }

    includingPlans.sort((a, b) => a.name.localeCompare(b.name));
    addablePlans.sort((a, b) => a.name.localeCompare(b.name));

    return { includingPlans, addablePlans };
  },
});

export const addCourseToPlan = mutation({
  args: {
    planId: v.id("subscriptionPlans"),
    courseId: v.id("courses"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated." });
    }

    try {
      await ctx.runMutation(internal.plansInternal.addCourseToPlanRecord, {
        planId: args.planId,
        courseId: args.courseId,
        updatedBy: userId as Id<"users">,
      });
    } catch (error) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: error instanceof Error ? error.message : "Could not add course to plan.",
      });
    }

    return null;
  },
});

export const removeCourseFromPlan = mutation({
  args: {
    planId: v.id("subscriptionPlans"),
    courseId: v.id("courses"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated." });
    }

    try {
      await ctx.runMutation(internal.plansInternal.removeCourseFromPlanRecord, {
        planId: args.planId,
        courseId: args.courseId,
        updatedBy: userId as Id<"users">,
      });
    } catch (error) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: error instanceof Error ? error.message : "Could not remove course from plan.",
      });
    }

    return null;
  },
});

export const updatePlan = mutation({
  args: {
    planId: v.id("subscriptionPlans"),
    name: v.string(),
    nameAr: v.string(),
    slug: v.string(),
    titleIcon: v.optional(v.string()),
    compareAtPriceAmount: v.optional(v.number()),
    priceSubtitle: v.optional(v.string()),
    priceSubtitleAr: v.optional(v.string()),
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
    ribbonTextAr: v.optional(v.string()),
    inheritsDescription: v.optional(v.string()),
    inheritsDescriptionAr: v.optional(v.string()),
    includeAllCourses: v.boolean(),
    includedCourseIds: v.array(v.id("courses")),
    includedCategoryIds: v.array(v.id("categories")),
    excludedCourseIds: v.array(v.id("courses")),
    features: v.array(planFeatureInputValidator),
    displayOrder: v.number(),
    isActive: v.boolean(),
    isHidden: v.optional(v.boolean()),
    maxCapacity: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated." });
    }

    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.deletedAt !== undefined) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Plan not found." });
    }

    const parsed = planUpdateInputSchema.safeParse({
      name: args.name,
      nameAr: args.nameAr,
      slug: args.slug,
      titleIcon: args.titleIcon,
      compareAtPriceAmount: args.compareAtPriceAmount,
      priceSubtitle: args.priceSubtitle,
      priceSubtitleAr: args.priceSubtitleAr,
      theme: args.theme,
      badgeTag: args.badgeTag,
      ribbonText: args.ribbonText,
      ribbonTextAr: args.ribbonTextAr,
      inheritsDescription: args.inheritsDescription,
      inheritsDescriptionAr: args.inheritsDescriptionAr,
      includeAllCourses: args.includeAllCourses,
      includedCourseIds: args.includedCourseIds,
      includedCategoryIds: args.includedCategoryIds,
      excludedCourseIds: args.excludedCourseIds,
      features: args.features.map((f) => ({
        icon: f.icon,
        title: f.title,
        titleAr: f.titleAr,
        subtitle: f.subtitle,
        subtitleAr: f.subtitleAr,
        subtitleMode: f.subtitleMode,
        subtitleTemplate: f.subtitleTemplate,
        subtitleTemplateAr: f.subtitleTemplateAr,
        isChecklistItem: f.isChecklistItem,
        displayOrder: f.displayOrder,
      })),
      displayOrder: args.displayOrder,
      isActive: args.isActive,
      isHidden: args.isHidden,
      maxCapacity: args.maxCapacity,
    });

    if (!parsed.success) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: formatPlanValidationMessage(parsed.error),
      });
    }

    await assertUniqueSlug(ctx, parsed.data.slug, args.planId);

    await ctx.runMutation(internal.plansInternal.patchPlanRecord, {
      planId: args.planId,
      name: parsed.data.name,
      name_ar: parsed.data.nameAr,
      slug: parsed.data.slug,
      titleIcon: parsed.data.titleIcon,
      compareAtPriceAmount: parsed.data.compareAtPriceAmount,
      priceSubtitle: parsed.data.priceSubtitle,
      priceSubtitle_ar: parsed.data.priceSubtitleAr,
      theme: parsed.data.theme,
      badgeTag: parsed.data.badgeTag,
      ribbonText: parsed.data.ribbonText,
      ribbonText_ar: parsed.data.ribbonTextAr,
      inheritsDescription: parsed.data.inheritsDescription,
      inheritsDescription_ar: parsed.data.inheritsDescriptionAr,
      includeAllCourses: parsed.data.includeAllCourses,
      includedCourseIds: args.includedCourseIds,
      includedCategoryIds: args.includedCategoryIds,
      excludedCourseIds: args.excludedCourseIds,
      features: mapFeatures(parsed.data.features),
      displayOrder: parsed.data.displayOrder,
      isActive: parsed.data.isActive,
      isHidden: parsed.data.isHidden,
      maxCapacity: parsed.data.maxCapacity,
      updatedBy: userId as Id<"users">,
    });

    return null;
  },
});

export const updatePlanPrice = mutation({
  args: {
    planId: v.id("subscriptionPlans"),
    priceAmount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated." });
    }

    const parsed = planPriceUpdateSchema.safeParse({ priceAmount: args.priceAmount });
    if (!parsed.success) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: parsed.error.errors[0]?.message ?? "Invalid price.",
      });
    }

    await ctx.scheduler.runAfter(0, internal.plansStripe.updatePlanPriceOnStripe, {
      planId: args.planId,
      priceAmount: parsed.data.priceAmount,
      updatedBy: userId as Id<"users">,
    });

    return null;
  },
});

export const archivePlan = mutation({
  args: {
    planId: v.id("subscriptionPlans"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated." });
    }

    await ctx.scheduler.runAfter(0, internal.plansStripe.archivePlanOnStripe, {
      planId: args.planId,
      updatedBy: userId as Id<"users">,
    });

    return null;
  },
});
