"use node";

import { action, internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import Stripe from "stripe";
import { planCreateInputSchema, planPriceUpdateSchema } from "../shared/validation/plan";
import { requireUserAction } from "./utils/auth";
import { internal } from "./_generated/api";

const planThemeValidator = v.object({
  primary: v.string(),
  secondary: v.string(),
  border: v.string(),
  headerBg: v.string(),
  buttonBg: v.string(),
});

const planFeatureValidator = v.object({
  icon: v.string(),
  title: v.string(),
  title_ar: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  subtitle_ar: v.optional(v.string()),
  isChecklistItem: v.boolean(),
  displayOrder: v.number(),
});

function getStripe(): Stripe {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new ConvexError({
      code: "STRIPE_NOT_CONFIGURED",
      message: "STRIPE_SECRET_KEY is not configured.",
    });
  }
  return new Stripe(stripeSecretKey);
}

export const createPlanWithStripe = action({
  args: {
    name: v.string(),
    name_ar: v.string(),
    slug: v.string(),
    billingInterval: v.union(v.literal("month"), v.literal("year")),
    priceAmount: v.number(),
    priceCurrency: v.string(),
    compareAtPriceAmount: v.optional(v.number()),
    priceSubtitle: v.optional(v.string()),
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
    includesPlanId: v.optional(v.id("subscriptionPlans")),
    includeAllCourses: v.boolean(),
    includedCourseIds: v.array(v.id("courses")),
    includedCategoryIds: v.array(v.id("categories")),
    features: v.array(planFeatureValidator),
    displayOrder: v.number(),
    isActive: v.boolean(),
  },
  returns: v.id("subscriptionPlans"),
  handler: async (ctx, args) => {
    const { userId } = await requireUserAction(ctx);
    await ctx.runQuery(internal.user.requireTechQuery, {});

    const parsed = planCreateInputSchema.safeParse({
      name: args.name,
      nameAr: args.name_ar,
      slug: args.slug,
      billingInterval: args.billingInterval,
      priceAmount: args.priceAmount,
      priceCurrency: args.priceCurrency,
      compareAtPriceAmount: args.compareAtPriceAmount,
      priceSubtitle: args.priceSubtitle,
      theme: args.theme,
      badgeTag: args.badgeTag,
      ribbonText: args.ribbonText,
      includesPlanId: args.includesPlanId,
      includeAllCourses: args.includeAllCourses,
      includedCourseIds: args.includedCourseIds,
      includedCategoryIds: args.includedCategoryIds,
      features: args.features.map((f) => ({
        icon: f.icon,
        title: f.title,
        titleAr: f.title_ar,
        subtitle: f.subtitle,
        subtitleAr: f.subtitle_ar,
        isChecklistItem: f.isChecklistItem,
        displayOrder: f.displayOrder,
      })),
      displayOrder: args.displayOrder,
      isActive: args.isActive,
    });

    if (!parsed.success) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: parsed.error.errors[0]?.message ?? "Invalid plan input.",
      });
    }

    try {
      await ctx.runQuery(internal.plansInternal.validateNewPlanInternal, {
        slug: args.slug,
        includesPlanId: args.includesPlanId,
      });
    } catch (error) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: error instanceof Error ? error.message : "Invalid plan.",
      });
    }

    const stripe = getStripe();

    const product = await stripe.products.create({
      name: args.name,
      metadata: {
        planSlug: args.slug,
        source: "vod-panel",
      },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: args.priceAmount,
      currency: args.priceCurrency.toLowerCase(),
      recurring: { interval: args.billingInterval },
      metadata: {
        planSlug: args.slug,
        source: "vod-panel",
      },
    });

    const planId: Id<"subscriptionPlans"> = await ctx.runMutation(
      internal.plansInternal.insertPlanRecord,
      {
        name: args.name,
        name_ar: args.name_ar,
        slug: args.slug,
        billingInterval: args.billingInterval,
        stripeProductId: product.id,
        stripePriceId: price.id,
        priceAmount: args.priceAmount,
        priceCurrency: args.priceCurrency.toLowerCase(),
        compareAtPriceAmount: args.compareAtPriceAmount,
        priceSubtitle: args.priceSubtitle,
        theme: args.theme,
        badgeTag: args.badgeTag,
        ribbonText: args.ribbonText,
        includesPlanId: args.includesPlanId,
        includeAllCourses: args.includeAllCourses,
        includedCourseIds: args.includedCourseIds,
        includedCategoryIds: args.includedCategoryIds,
        features: args.features,
        displayOrder: args.displayOrder,
        isActive: args.isActive,
        updatedBy: userId as Id<"users">,
      },
    );

    return planId;
  },
});

export const updatePlanPriceWithStripe = action({
  args: {
    planId: v.id("subscriptionPlans"),
    priceAmount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireUserAction(ctx);
    await ctx.runQuery(internal.user.requireTechQuery, {});

    const parsed = planPriceUpdateSchema.safeParse({ priceAmount: args.priceAmount });
    if (!parsed.success) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: parsed.error.errors[0]?.message ?? "Invalid price.",
      });
    }

    await ctx.runAction(internal.plansStripe.updatePlanPriceOnStripe, {
      planId: args.planId,
      priceAmount: parsed.data.priceAmount,
      updatedBy: userId as Id<"users">,
    });

    return null;
  },
});

export const updatePlanPriceOnStripe = internalAction({
  args: {
    planId: v.id("subscriptionPlans"),
    priceAmount: v.number(),
    updatedBy: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await ctx.runQuery(internal.plansInternal.getPlanByIdInternal, {
      planId: args.planId,
    });

    if (!plan || plan.deletedAt !== undefined) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Plan not found.",
      });
    }

    if (args.priceAmount === plan.priceAmount) {
      throw new ConvexError({
        code: "NO_CHANGE",
        message: "Price is unchanged.",
      });
    }

    const stripe = getStripe();

    const newPrice = await stripe.prices.create({
      product: plan.stripeProductId,
      unit_amount: args.priceAmount,
      currency: plan.priceCurrency,
      recurring: { interval: plan.billingInterval },
      metadata: {
        planSlug: plan.slug,
        source: "vod-panel",
      },
    });

    try {
      await stripe.prices.update(plan.stripePriceId, { active: false });
    } catch (error) {
      console.warn("Failed to archive old Stripe price:", error);
    }

    await ctx.runMutation(internal.plansInternal.insertArchivedPriceHistory, {
      planId: args.planId,
      stripePriceId: plan.stripePriceId,
      priceAmount: plan.priceAmount,
      priceCurrency: plan.priceCurrency,
      updatedBy: args.updatedBy,
    });

    await ctx.runMutation(internal.plansInternal.patchPlanPrice, {
      planId: args.planId,
      stripePriceId: newPrice.id,
      priceAmount: args.priceAmount,
      priceCurrency: plan.priceCurrency,
      updatedBy: args.updatedBy,
    });

    return null;
  },
});

export const archivePlanOnStripe = internalAction({
  args: {
    planId: v.id("subscriptionPlans"),
    updatedBy: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await ctx.runQuery(internal.plansInternal.getPlanByIdInternal, {
      planId: args.planId,
    });

    if (!plan || plan.deletedAt !== undefined) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Plan not found.",
      });
    }

    await ctx.runMutation(internal.plansInternal.archivePlanRecord, {
      planId: args.planId,
      updatedBy: args.updatedBy,
    });

    const stripe = getStripe();
    try {
      await stripe.products.update(plan.stripeProductId, { active: false });
      await stripe.prices.update(plan.stripePriceId, { active: false });
    } catch (error) {
      console.warn("Failed to deactivate Stripe product/price:", error);
    }

    return null;
  },
});
