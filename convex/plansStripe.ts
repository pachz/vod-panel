"use node";

import { action, internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import Stripe from "stripe";
import { planCreateInputSchema, planPriceUpdateSchema } from "../shared/validation/plan";
import { formatPlanValidationMessage } from "../shared/validation/planFormValidation";
import { requireUserAction } from "./utils/auth";
import { internal } from "./_generated/api";
import { usesPackageSubscriptionModel } from "../shared/subscriptionModel";

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
  subtitleMode: v.optional(v.union(v.literal("manual"), v.literal("template"))),
  subtitleTemplate: v.optional(v.string()),
  subtitleTemplate_ar: v.optional(v.string()),
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
    includeAllCourses: v.boolean(),
    includedCourseIds: v.array(v.id("courses")),
    includedCategoryIds: v.array(v.id("categories")),
    excludedCourseIds: v.array(v.id("courses")),
    features: v.array(planFeatureValidator),
    displayOrder: v.number(),
    isActive: v.boolean(),
    isHidden: v.optional(v.boolean()),
    maxCapacity: v.optional(v.number()),
  },
  returns: v.id("subscriptionPlans"),
  handler: async (ctx, args) => {
    const { userId } = await requireUserAction(ctx);
    await ctx.runQuery(internal.user.requireTechQuery, {});

    const parsed = planCreateInputSchema.safeParse({
      name: args.name,
      nameAr: args.name_ar,
      slug: args.slug,
      titleIcon: args.titleIcon,
      billingInterval: args.billingInterval,
      priceAmount: args.priceAmount,
      priceCurrency: args.priceCurrency,
      compareAtPriceAmount: args.compareAtPriceAmount,
      priceSubtitle: args.priceSubtitle,
      priceSubtitleAr: args.priceSubtitle_ar,
      theme: args.theme,
      badgeTag: args.badgeTag,
      ribbonText: args.ribbonText,
      ribbonTextAr: args.ribbonText_ar,
      inheritsDescription: args.inheritsDescription,
      inheritsDescriptionAr: args.inheritsDescription_ar,
      includeAllCourses: args.includeAllCourses,
      includedCourseIds: args.includedCourseIds,
      includedCategoryIds: args.includedCategoryIds,
      excludedCourseIds: args.excludedCourseIds,
      features: args.features.map((f) => ({
        icon: f.icon,
        title: f.title,
        titleAr: f.title_ar,
        subtitle: f.subtitle,
        subtitleAr: f.subtitle_ar,
        subtitleMode: f.subtitleMode,
        subtitleTemplate: f.subtitleTemplate,
        subtitleTemplateAr: f.subtitleTemplate_ar,
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

    try {
      await ctx.runQuery(internal.plansInternal.validateNewPlanInternal, {
        slug: args.slug,
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
        titleIcon: parsed.data.titleIcon,
        billingInterval: args.billingInterval,
        stripeProductId: product.id,
        stripePriceId: price.id,
        priceAmount: args.priceAmount,
        priceCurrency: args.priceCurrency.toLowerCase(),
        compareAtPriceAmount: parsed.data.compareAtPriceAmount,
        priceSubtitle: parsed.data.priceSubtitle,
        priceSubtitle_ar: parsed.data.priceSubtitleAr,
        theme: parsed.data.theme,
        badgeTag: parsed.data.badgeTag,
        ribbonText: parsed.data.ribbonText,
        ribbonText_ar: parsed.data.ribbonTextAr,
        inheritsDescription: parsed.data.inheritsDescription,
        inheritsDescription_ar: parsed.data.inheritsDescriptionAr,
        includeAllCourses: args.includeAllCourses,
        includedCourseIds: args.includedCourseIds,
        includedCategoryIds: args.includedCategoryIds,
        excludedCourseIds: args.excludedCourseIds,
        features: args.features,
        displayOrder: args.displayOrder,
        isActive: args.isActive,
        isHidden: parsed.data.isHidden,
        maxCapacity: args.maxCapacity,
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

async function getOrCreateStripeCustomerForPlanCheckout(
  ctx: import("./_generated/server").ActionCtx,
  userId: Id<"users">,
  stripe: Stripe,
): Promise<string> {
  const userWithCustomer = await ctx.runQuery(internal.paymentInternal.getUserWithCustomer, {
    userId,
  });

  if (userWithCustomer?.stripeCustomerId) {
    try {
      await stripe.customers.retrieve(userWithCustomer.stripeCustomerId);
      return userWithCustomer.stripeCustomerId;
    } catch {
      // fall through to create
    }
  }

  const userFull = await ctx.runQuery(internal.paymentInternal.getUserFull, { userId });
  if (!userFull) {
    throw new ConvexError({ code: "NOT_FOUND", message: "User not found." });
  }

  const customer = await stripe.customers.create({
    email: userFull.email || undefined,
    name: userFull.name || undefined,
    phone: userFull.phone || undefined,
    metadata: { userId },
  });

  await ctx.runMutation(internal.paymentInternal.updateUserStripeCustomerId, {
    userId,
    stripeCustomerId: customer.id,
  });

  return customer.id;
}

export const createPlanCheckoutSession = action({
  args: {
    planId: v.id("subscriptionPlans"),
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const { userId } = await requireUserAction(ctx);
    const userIdTyped = userId as Id<"users">;

    const user = await ctx.runQuery(internal.user.getUserById, { id: userIdTyped });
    if (!user || user.deletedAt) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found." });
    }
    if (!usesPackageSubscriptionModel(user)) {
      throw new ConvexError({
        code: "LEGACY_BILLING",
        message: "Plan checkout is only available on the package billing model.",
      });
    }

    const plan = await ctx.runQuery(internal.plansInternal.getPlanByIdInternal, {
      planId: args.planId,
    });
    if (!plan || plan.deletedAt !== undefined || !plan.isActive || plan.isHidden === true) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Plan not available." });
    }

    const capacity = await ctx.runQuery(internal.plansInternal.getPlanCapacityStatus, {
      planId: args.planId,
    });
    if (capacity.isAtCapacity) {
      throw new ConvexError({
        code: "PLAN_AT_CAPACITY",
        message: "This plan is currently full. Please choose another plan.",
      });
    }

    const existingSub = await ctx.runQuery(internal.paymentInternal.getMySubscriptionForUser, {
      userId: userIdTyped,
    });
    const nowMs = Date.now();
    if (
      existingSub &&
      (existingSub.status === "active" || existingSub.status === "trialing") &&
      existingSub.currentPeriodEnd >= nowMs
    ) {
      throw new ConvexError({
        code: "ALREADY_SUBSCRIBED",
        message: "You already have an active subscription. Use upgrade instead.",
      });
    }

    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomerForPlanCheckout(ctx, userIdTyped, stripe);
    const panelUrl = process.env.PANEL_URL || "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: args.successUrl ?? `${panelUrl}/payments?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: args.cancelUrl ?? `${panelUrl}/payments?canceled=true`,
      metadata: {
        userId: userIdTyped,
        planId: args.planId,
      },
    });

    if (!session.url || !session.id) {
      throw new ConvexError({
        code: "CHECKOUT_FAILED",
        message: "Failed to create checkout session.",
      });
    }

    await ctx.runMutation(internal.paymentInternal.storeCheckoutSession, {
      sessionId: session.id,
      userId: userIdTyped,
    });

    return session.url;
  },
});

export const upgradePlanSubscription = action({
  args: {
    planId: v.id("subscriptionPlans"),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const { userId } = await requireUserAction(ctx);
    const userIdTyped = userId as Id<"users">;

    const user = await ctx.runQuery(internal.user.getUserById, { id: userIdTyped });
    if (!user || user.deletedAt) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found." });
    }
    if (!usesPackageSubscriptionModel(user)) {
      throw new ConvexError({
        code: "LEGACY_BILLING",
        message: "Plan upgrades are only available on the package billing model.",
      });
    }

    const plan = await ctx.runQuery(internal.plansInternal.getPlanByIdInternal, {
      planId: args.planId,
    });
    if (!plan || plan.deletedAt !== undefined || !plan.isActive || plan.isHidden === true) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Plan not available." });
    }

    const capacity = await ctx.runQuery(internal.plansInternal.getPlanCapacityStatus, {
      planId: args.planId,
    });
    if (capacity.isAtCapacity) {
      throw new ConvexError({
        code: "PLAN_AT_CAPACITY",
        message: "This plan is currently full. Please choose another plan.",
      });
    }

    const existingSub = await ctx.runQuery(internal.paymentInternal.getMySubscriptionForUser, {
      userId: userIdTyped,
    });
    const nowMs = Date.now();
    if (
      !existingSub ||
      !((existingSub.status === "active" || existingSub.status === "trialing") &&
        existingSub.currentPeriodEnd >= nowMs)
    ) {
      throw new ConvexError({
        code: "NO_ACTIVE_SUBSCRIPTION",
        message: "Subscribe to a plan first before upgrading.",
      });
    }

    if (existingSub.planId === args.planId) {
      throw new ConvexError({
        code: "SAME_PLAN",
        message: "You are already on this plan.",
      });
    }

    if (existingSub.subscriptionId.startsWith("admin-grant-")) {
      throw new ConvexError({
        code: "ADMIN_GRANTED",
        message: "Admin-granted subscriptions cannot be upgraded online. Contact support.",
      });
    }

    const stripe = getStripe();
    const stripeSubscription = await stripe.subscriptions.retrieve(existingSub.subscriptionId, {
      expand: ["items.data.price"],
    });
    const itemId = stripeSubscription.items.data[0]?.id;
    if (!itemId) {
      throw new ConvexError({
        code: "STRIPE_ERROR",
        message: "Could not resolve subscription item for upgrade.",
      });
    }

    const updated = await stripe.subscriptions.update(existingSub.subscriptionId, {
      items: [{ id: itemId, price: plan.stripePriceId }],
      proration_behavior: "create_prorations",
    });

    const updatedPeriodStart = (updated as { current_period_start?: number }).current_period_start;
    const updatedPeriodEnd = (updated as { current_period_end?: number }).current_period_end;

    await ctx.runMutation(internal.paymentInternal.upsertSubscription, {
      subscriptionId: updated.id,
      userId: userIdTyped,
      customerId:
        typeof updated.customer === "string" ? updated.customer : updated.customer.id,
      status: updated.status as
        | "active"
        | "canceled"
        | "past_due"
        | "unpaid"
        | "incomplete"
        | "trialing",
      currentPeriodStart:
        updatedPeriodStart != null ? updatedPeriodStart * 1000 : existingSub.currentPeriodStart,
      currentPeriodEnd:
        updatedPeriodEnd != null ? updatedPeriodEnd * 1000 : existingSub.currentPeriodEnd,
      cancelAtPeriodEnd: Boolean((updated as { cancel_at_period_end?: boolean }).cancel_at_period_end),
      canceledAt: (updated as { canceled_at?: number | null }).canceled_at
        ? (updated as { canceled_at: number }).canceled_at * 1000
        : undefined,
      interval: plan.billingInterval,
      intervalCount: 1,
      planId: args.planId,
      stripePriceId: plan.stripePriceId,
    });

    return {
      success: true,
      message: "Subscription upgraded successfully.",
    };
  },
});
