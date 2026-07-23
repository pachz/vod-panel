import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mapSubscriptionStatus } from "./lib";
import {
  activeSubscriptionPlanValidator,
  subscriptionToolResultValidator,
} from "./validators";
import { pickPrimarySubscriptionForUserDisplay } from "../paymentInternal";
import {
  countActiveSubscribersForPlan,
  getStoredPlanCourseStats,
} from "../plansInternal";
import { resolvePlanFeaturesForDisplay } from "../../shared/planFeatureTemplate";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const MAX_UI_CARD_PLANS = 10;

function isPublicActivePlan(plan: Doc<"subscriptionPlans">): boolean {
  return plan.deletedAt === undefined && plan.isActive && plan.isHidden !== true;
}

async function mapPlanToAssistantResult(
  ctx: import("../_generated/server").QueryCtx,
  plan: Doc<"subscriptionPlans">,
  currentPlanId: Id<"subscriptionPlans"> | undefined,
  nowMs: number,
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
  ).sort((a, b) => a.displayOrder - b.displayOrder);

  const activeSubscriberCount = await countActiveSubscribersForPlan(ctx, plan, nowMs);
  const maxCapacity = plan.maxCapacity ?? null;

  return {
    id: plan._id,
    nameEn: plan.name,
    nameAr: plan.name_ar,
    billingInterval: plan.billingInterval,
    priceAmount: plan.priceAmount,
    priceCurrency: plan.priceCurrency,
    compareAtPriceAmount: plan.compareAtPriceAmount,
    priceSubtitleEn: plan.priceSubtitle,
    priceSubtitleAr: plan.priceSubtitle_ar,
    courseCount: stats?.courses,
    lessonCount: stats?.lessons,
    hours: stats?.hours,
    featureTitlesEn: features.map((feature) => feature.title),
    featureTitlesAr: features.map((feature) => feature.title_ar ?? feature.title),
    isCurrentPlan: currentPlanId === plan._id,
    isAtCapacity: maxCapacity !== null && activeSubscriberCount >= maxCapacity,
  };
}

async function resolveCurrentPlanId(
  ctx: import("../_generated/server").QueryCtx,
  userId: Id<"users"> | undefined,
  nowMs: number,
): Promise<Id<"subscriptionPlans"> | undefined> {
  if (!userId) {
    return undefined;
  }

  const user = await ctx.db.get(userId);
  if (!user || user.deletedAt !== undefined) {
    return undefined;
  }

  const subs = await ctx.db
    .query("subscriptions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  const subscription = pickPrimarySubscriptionForUserDisplay(subs, nowMs);
  if (
    subscription &&
    ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) &&
    subscription.currentPeriodEnd >= nowMs &&
    subscription.planId
  ) {
    return subscription.planId;
  }

  return undefined;
}

export const getSubscriptionForAssistant = internalQuery({
  args: {
    userId: v.id("users"),
    nowMs: v.number(),
  },
  returns: subscriptionToolResultValidator,
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.deletedAt !== undefined) {
      return {
        authenticated: true,
        status: "none" as const,
        hasBillingAccount: false,
      };
    }

    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect();
    const subscription = pickPrimarySubscriptionForUserDisplay(subs, args.nowMs);
    const status = mapSubscriptionStatus(subscription, args.nowMs);

    let planNameEn: string | undefined;
    let planNameAr: string | undefined;

    if (subscription?.planId) {
      const plan = await ctx.db.get(subscription.planId);
      if (plan && plan.deletedAt === undefined) {
        planNameEn = plan.name;
        planNameAr = plan.name_ar;
      }
    } else if (subscription) {
      const paymentSettings = await ctx.db.query("paymentSettings").first();
      planNameEn = paymentSettings?.productName ?? "All access";
      planNameAr = paymentSettings?.productName ?? "وصول كامل";
    }

    const hasBillingAccount = Boolean(
      user.stripeCustomerId ||
        (subscription && !subscription.subscriptionId.startsWith("admin-grant-")),
    );

    return {
      authenticated: true,
      status,
      planNameEn,
      planNameAr,
      currentPeriodEnd: subscription?.currentPeriodEnd,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd,
      hasBillingAccount,
    };
  },
});

export const listActiveSubscriptionPlansInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    nowMs: v.number(),
  },
  returns: v.array(activeSubscriptionPlanValidator),
  handler: async (ctx, args) => {
    const currentPlanId = await resolveCurrentPlanId(ctx, args.userId, args.nowMs);

    const allPlans = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();

    const publicPlans = allPlans
      .filter(isPublicActivePlan)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    const results = [];
    for (const plan of publicPlans) {
      results.push(await mapPlanToAssistantResult(ctx, plan, currentPlanId, args.nowMs));
    }

    return results;
  },
});

export const getPlansByIdsForUiCardsInternal = internalQuery({
  args: {
    planIds: v.array(v.string()),
    userId: v.optional(v.id("users")),
    nowMs: v.number(),
  },
  returns: v.array(activeSubscriptionPlanValidator),
  handler: async (ctx, args) => {
    const currentPlanId = await resolveCurrentPlanId(ctx, args.userId, args.nowMs);
    const results = [];
    const seen = new Set<string>();

    for (const rawId of args.planIds.slice(0, MAX_UI_CARD_PLANS)) {
      const id = rawId.trim();
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);

      let plan: Doc<"subscriptionPlans"> | null = null;
      try {
        plan = await ctx.db.get(id as Id<"subscriptionPlans">);
      } catch {
        continue;
      }

      if (!plan || !isPublicActivePlan(plan)) {
        continue;
      }

      results.push(await mapPlanToAssistantResult(ctx, plan, currentPlanId, args.nowMs));
    }

    return results;
  },
});
