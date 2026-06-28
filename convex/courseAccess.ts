import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireUser } from "./utils/auth";
import { pickPrimarySubscriptionForUserDisplay } from "./paymentInternal";
import {
  countActiveSubscribersForPlan,
  getStoredPlanCourseStats,
} from "./plansInternal";
import { resolvePlanFeaturesForDisplay } from "../shared/planFeatureTemplate";
import { usesPackageSubscriptionModel } from "../shared/subscriptionModel";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

type CourseAccessPaywallMode =
  | "legacy"
  | "packages_subscribe"
  | "packages_upgrade"
  | null;

const planThemeValidator = v.object({
  primary: v.string(),
  secondary: v.string(),
  border: v.string(),
  headerBg: v.string(),
  buttonBg: v.string(),
});

const paywallPlanValidator = v.object({
  _id: v.id("subscriptionPlans"),
  name: v.string(),
  name_ar: v.string(),
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
      isChecklistItem: v.boolean(),
      displayOrder: v.number(),
    }),
  ),
  displayOrder: v.number(),
  isAtCapacity: v.boolean(),
  isCurrentPlan: v.boolean(),
  courseStats: v.optional(
    v.object({
      courses: v.number(),
      lessons: v.number(),
      hours: v.number(),
    }),
  ),
});

function isPublicPlan(plan: Doc<"subscriptionPlans">): boolean {
  return plan.deletedAt === undefined && plan.isActive && plan.isHidden !== true;
}

async function mapPlanForPaywall(
  plan: Doc<"subscriptionPlans">,
  nowMs: number,
  ctx: import("./_generated/server").QueryCtx,
  currentPlanId?: Id<"subscriptionPlans">,
) {
  const stats = getStoredPlanCourseStats(plan);
  const features = resolvePlanFeaturesForDisplay(
    plan.features.map((feature) => ({
      icon: feature.icon,
      title: feature.title,
      title_ar: feature.title_ar,
      subtitle: feature.subtitle,
      subtitleAr: feature.subtitle_ar,
      subtitleMode: feature.subtitleMode,
      subtitleTemplate: feature.subtitleTemplate,
      subtitleTemplateAr: feature.subtitleTemplate_ar,
      isChecklistItem: feature.isChecklistItem,
      displayOrder: feature.displayOrder,
    })),
    stats,
  ).map((feature) => ({
    icon: feature.icon,
    title: feature.title,
    title_ar: feature.title_ar,
    subtitle: feature.subtitle,
    subtitle_ar: feature.subtitle_ar,
    isChecklistItem: feature.isChecklistItem,
    displayOrder: feature.displayOrder,
  }));

  const activeSubscriberCount = await countActiveSubscribersForPlan(ctx, plan, nowMs);
  const maxCapacity = plan.maxCapacity ?? null;

  return {
    _id: plan._id,
    name: plan.name,
    name_ar: plan.name_ar,
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
    features,
    displayOrder: plan.displayOrder,
    courseStats: stats,
    isAtCapacity: maxCapacity !== null && activeSubscriberCount >= maxCapacity,
    isCurrentPlan: currentPlanId === plan._id,
  };
}

async function userHasCourseViaPlan(
  ctx: import("./_generated/server").QueryCtx,
  userId: Id<"users">,
  courseId: Id<"courses">,
  nowMs: number,
): Promise<{
  hasAccess: boolean;
  currentPlanId?: Id<"subscriptionPlans">;
}> {
  const subs = await ctx.db
    .query("subscriptions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  const subscription = pickPrimarySubscriptionForUserDisplay(subs, nowMs);

  if (
    !subscription ||
    !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) ||
    subscription.currentPeriodEnd < nowMs
  ) {
    return { hasAccess: false };
  }

  if (!subscription.planId) {
    return { hasAccess: false, currentPlanId: undefined };
  }

  const plan = await ctx.db.get(subscription.planId);
  if (!plan || plan.deletedAt !== undefined) {
    return { hasAccess: false, currentPlanId: subscription.planId };
  }

  return {
    hasAccess: plan.resolvedCourseIds.includes(courseId),
    currentPlanId: subscription.planId,
  };
}

export const getCourseAccessState = query({
  args: {
    courseId: v.id("courses"),
    now: v.number(),
  },
  returns: v.object({
    canAccess: v.boolean(),
    usesPackageModel: v.boolean(),
    paywallMode: v.union(
      v.literal("legacy"),
      v.literal("packages_subscribe"),
      v.literal("packages_upgrade"),
      v.null(),
    ),
    currentPlanId: v.union(v.id("subscriptionPlans"), v.null()),
    plans: v.array(paywallPlanValidator),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        canAccess: false,
        usesPackageModel: false,
        paywallMode: null,
        currentPlanId: null,
        plans: [],
      };
    }

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        canAccess: false,
        usesPackageModel: false,
        paywallMode: null,
        currentPlanId: null,
        plans: [],
      };
    }

    const user = await ctx.db.get(userId as Id<"users">);
    if (!user || user.deletedAt) {
      return {
        canAccess: false,
        usesPackageModel: false,
        paywallMode: null,
        currentPlanId: null,
        plans: [],
      };
    }

    const course = await ctx.db.get(args.courseId);
    if (!course || course.deletedAt !== undefined) {
      return {
        canAccess: false,
        usesPackageModel: usesPackageSubscriptionModel(user),
        paywallMode: null,
        currentPlanId: null,
        plans: [],
      };
    }

    if (user.isGod) {
      return {
        canAccess: true,
        usesPackageModel: usesPackageSubscriptionModel(user),
        paywallMode: null,
        currentPlanId: null,
        plans: [],
      };
    }

    const nowMs = args.now;
    const packageModel = usesPackageSubscriptionModel(user);

    if (!packageModel) {
      const subs = await ctx.db
        .query("subscriptions")
        .withIndex("userId", (q) => q.eq("userId", userId as Id<"users">))
        .collect();
      const subscription = pickPrimarySubscriptionForUserDisplay(subs, nowMs);
      const hasLegacyAccess =
        subscription &&
        ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) &&
        subscription.currentPeriodEnd >= nowMs;

      return {
        canAccess: Boolean(hasLegacyAccess),
        usesPackageModel: false,
        paywallMode: (hasLegacyAccess ? null : "legacy") as CourseAccessPaywallMode,
        currentPlanId: null,
        plans: [],
      };
    }

    const { hasAccess, currentPlanId } = await userHasCourseViaPlan(
      ctx,
      userId as Id<"users">,
      args.courseId,
      nowMs,
    );

    if (hasAccess) {
      return {
        canAccess: true,
        usesPackageModel: true,
        paywallMode: null,
        currentPlanId: currentPlanId ?? null,
        plans: [],
      };
    }

    const allPlans = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();

    const coursePlans = allPlans
      .filter(
        (plan) => isPublicPlan(plan) && plan.resolvedCourseIds.includes(args.courseId),
      )
      .sort((a, b) => a.displayOrder - b.displayOrder);

    const plans = await Promise.all(
      coursePlans.map((plan) => mapPlanForPaywall(plan, nowMs, ctx, currentPlanId)),
    );

    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", userId as Id<"users">))
      .collect();
    const subscription = pickPrimarySubscriptionForUserDisplay(subs, nowMs);
    const hasActiveSubscription =
      subscription &&
      ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) &&
      subscription.currentPeriodEnd >= nowMs;

    return {
      canAccess: false,
      usesPackageModel: true,
      paywallMode: (hasActiveSubscription
        ? "packages_upgrade"
        : "packages_subscribe") as CourseAccessPaywallMode,
      currentPlanId: currentPlanId ?? null,
      plans,
    };
  },
});

export const listSubscriberPackagePlans = query({
  args: {
    now: v.number(),
  },
  returns: v.object({
    usesPackageModel: v.boolean(),
    hasActiveSubscription: v.boolean(),
    plans: v.array(paywallPlanValidator),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx);

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        usesPackageModel: false,
        hasActiveSubscription: false,
        plans: [],
      };
    }

    const user = await ctx.db.get(userId as Id<"users">);
    if (!user || user.deletedAt || !usesPackageSubscriptionModel(user)) {
      return {
        usesPackageModel: false,
        hasActiveSubscription: false,
        plans: [],
      };
    }

    const nowMs = args.now;
    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", userId as Id<"users">))
      .collect();
    const subscription = pickPrimarySubscriptionForUserDisplay(subs, nowMs);
    const hasActiveSubscription = Boolean(
      subscription &&
        ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) &&
        subscription.currentPeriodEnd >= nowMs,
    );
    const currentPlanId = hasActiveSubscription ? subscription?.planId : undefined;

    const allPlans = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();

    const publicPlans = allPlans
      .filter(isPublicPlan)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    const plans = await Promise.all(
      publicPlans.map((plan) => mapPlanForPaywall(plan, nowMs, ctx, currentPlanId)),
    );

    return {
      usesPackageModel: true,
      hasActiveSubscription,
      plans,
    };
  },
});

export const assertUserUsesPackageModel = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    await requireUser(ctx);
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return false;
    }
    const user = await ctx.db.get(userId as Id<"users">);
    return usesPackageSubscriptionModel(user);
  },
});
