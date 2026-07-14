import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { requireUser } from "./utils/auth";
import { internal } from "./_generated/api";
import { SUBSCRIPTION_MODEL } from "../shared/subscriptionModel";

const MAX_STRIPE_SUBSCRIPTIONS = 2000;

function isStripeSubscription(sub: Pick<Doc<"subscriptions">, "subscriptionId">): boolean {
  return sub.subscriptionId.startsWith("sub_");
}

const subscriptionStatusValidator = v.union(
  v.literal("active"),
  v.literal("canceled"),
  v.literal("past_due"),
  v.literal("unpaid"),
  v.literal("incomplete"),
  v.literal("trialing"),
);

const eligibleRenewalPriceValidator = v.object({
  stripePriceId: v.string(),
  planId: v.optional(v.id("subscriptionPlans")),
  planName: v.string(),
  priceAmount: v.number(),
  priceCurrency: v.string(),
  billingInterval: v.union(v.literal("month"), v.literal("year")),
  isCurrent: v.boolean(),
  isArchived: v.boolean(),
});

const subscriptionRowValidator = v.object({
  subscriptionDocId: v.id("subscriptions"),
  subscriptionId: v.string(),
  customerId: v.string(),
  userId: v.id("users"),
  userName: v.union(v.string(), v.null()),
  userEmail: v.union(v.string(), v.null()),
  status: subscriptionStatusValidator,
  planId: v.union(v.id("subscriptionPlans"), v.null()),
  stripePriceId: v.union(v.string(), v.null()),
  planName: v.union(v.string(), v.null()),
  priceAmount: v.union(v.number(), v.null()),
  priceCurrency: v.union(v.string(), v.null()),
  renewalPlanName: v.union(v.string(), v.null()),
  renewalPriceAmount: v.union(v.number(), v.null()),
  renewalPriceCurrency: v.union(v.string(), v.null()),
  hasScheduledRenewalPrice: v.boolean(),
  interval: v.union(v.string(), v.null()),
  intervalCount: v.union(v.number(), v.null()),
  currentPeriodStart: v.number(),
  currentPeriodEnd: v.number(),
  cancelAtPeriodEnd: v.boolean(),
  autoRenewEnabled: v.boolean(),
  canManageStripe: v.boolean(),
  canceledAt: v.union(v.number(), v.null()),
  isAdminGranted: v.boolean(),
  isStripeBacked: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

function finalizeSubscriptionAdminRow(
  row: Omit<
    {
      subscriptionDocId: Id<"subscriptions">;
      subscriptionId: string;
      customerId: string;
      userId: Id<"users">;
      userName: string | null;
      userEmail: string | null;
      status: Doc<"subscriptions">["status"];
      planId: Id<"subscriptionPlans"> | null;
      stripePriceId: string | null;
      planName: string | null;
      priceAmount: number | null;
      priceCurrency: string | null;
      renewalPlanName?: string | null;
      renewalPriceAmount?: number | null;
      renewalPriceCurrency?: string | null;
      hasScheduledRenewalPrice?: boolean;
      interval: string | null;
      intervalCount: number | null;
      currentPeriodStart: number;
      currentPeriodEnd: number;
      cancelAtPeriodEnd: boolean;
      autoRenewEnabled: boolean;
      canManageStripe: boolean;
      canceledAt: number | null;
      isAdminGranted: boolean;
      isStripeBacked: boolean;
      createdAt: number;
      updatedAt: number;
    },
    never
  >,
) {
  return {
    ...row,
    renewalPlanName: row.renewalPlanName ?? null,
    renewalPriceAmount: row.renewalPriceAmount ?? null,
    renewalPriceCurrency: row.renewalPriceCurrency ?? null,
    hasScheduledRenewalPrice: row.hasScheduledRenewalPrice ?? false,
  };
}

function resolveLegacyPrice(
  sub: Doc<"subscriptions">,
  paymentSettings: Doc<"paymentSettings"> | null,
): { priceAmount: number | null; priceCurrency: string | null; planName: string | null } {
  if (!paymentSettings) {
    return { priceAmount: null, priceCurrency: null, planName: null };
  }

  const productName = paymentSettings.productName?.trim();
  const monthlyPriceId = paymentSettings.selectedPriceId;
  const yearlyPriceId = paymentSettings.selectedYearlyPriceId;

  if (sub.stripePriceId === monthlyPriceId || sub.interval === "month") {
    return {
      priceAmount: paymentSettings.priceAmount,
      priceCurrency: paymentSettings.priceCurrency,
      planName: productName ? `${productName} (Monthly)` : "Legacy monthly",
    };
  }

  if (
    (yearlyPriceId && sub.stripePriceId === yearlyPriceId) ||
    sub.interval === "year"
  ) {
    return {
      priceAmount: paymentSettings.yearlyPriceAmount ?? null,
      priceCurrency: paymentSettings.yearlyPriceCurrency ?? paymentSettings.priceCurrency,
      planName: productName ? `${productName} (Yearly)` : "Legacy yearly",
    };
  }

  return {
    priceAmount: null,
    priceCurrency: null,
    planName: productName ? `${productName} (Stripe)` : "Legacy Stripe",
  };
}

async function resolvePriceFromStripePriceId(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  stripePriceId: string,
  paymentSettings: Doc<"paymentSettings"> | null,
  planCache: Map<Id<"subscriptionPlans">, Doc<"subscriptionPlans"> | null>,
  planIdHint?: Id<"subscriptionPlans">,
): Promise<{
  planName: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
}> {
  if (planIdHint) {
    let plan = planCache.get(planIdHint);
    if (plan === undefined) {
      plan = await ctx.db.get(planIdHint);
      planCache.set(planIdHint, plan);
    }
    if (plan) {
      if (plan.stripePriceId === stripePriceId) {
        return {
          planName: plan.name,
          priceAmount: plan.priceAmount,
          priceCurrency: plan.priceCurrency,
        };
      }
      const history = await ctx.db
        .query("subscriptionPlanPriceHistory")
        .withIndex("by_planId", (q) => q.eq("planId", plan._id))
        .collect();
      const archived = history.find((entry) => entry.stripePriceId === stripePriceId);
      if (archived) {
        return {
          planName: `${plan.name} (archived)`,
          priceAmount: archived.priceAmount,
          priceCurrency: archived.priceCurrency,
        };
      }
    }
  }

  const plans = await ctx.db.query("subscriptionPlans").collect();
  for (const plan of plans) {
    if (plan.deletedAt !== undefined) {
      continue;
    }
    if (plan.stripePriceId === stripePriceId) {
      return {
        planName: plan.name,
        priceAmount: plan.priceAmount,
        priceCurrency: plan.priceCurrency,
      };
    }
  }

  const historyEntries = await ctx.db.query("subscriptionPlanPriceHistory").collect();
  for (const entry of historyEntries) {
    if (entry.stripePriceId !== stripePriceId) {
      continue;
    }
    const plan = await ctx.db.get(entry.planId);
    if (plan && plan.deletedAt === undefined) {
      return {
        planName: `${plan.name} (archived)`,
        priceAmount: entry.priceAmount,
        priceCurrency: entry.priceCurrency,
      };
    }
  }

  if (paymentSettings) {
    const productName = paymentSettings.productName?.trim();
    if (stripePriceId === paymentSettings.selectedPriceId) {
      return {
        planName: productName ? `${productName} (Monthly)` : "Legacy monthly",
        priceAmount: paymentSettings.priceAmount,
        priceCurrency: paymentSettings.priceCurrency,
      };
    }
    if (
      paymentSettings.selectedYearlyPriceId &&
      stripePriceId === paymentSettings.selectedYearlyPriceId
    ) {
      return {
        planName: productName ? `${productName} (Yearly)` : "Legacy yearly",
        priceAmount: paymentSettings.yearlyPriceAmount ?? null,
        priceCurrency:
          paymentSettings.yearlyPriceCurrency ?? paymentSettings.priceCurrency,
      };
    }
  }

  return { planName: null, priceAmount: null, priceCurrency: null };
}

async function resolveSubscriptionPriceDisplay(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  sub: Doc<"subscriptions">,
  paymentSettings: Doc<"paymentSettings"> | null,
  planCache: Map<Id<"subscriptionPlans">, Doc<"subscriptionPlans"> | null>,
  options: {
    stripePriceId?: string;
    planId?: Id<"subscriptionPlans">;
    isAdminGranted: boolean;
    isStripeBacked: boolean;
  },
): Promise<{
  planName: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
}> {
  if (options.isAdminGranted) {
    return { planName: "Admin grant", priceAmount: null, priceCurrency: null };
  }

  if (options.stripePriceId) {
    return await resolvePriceFromStripePriceId(
      ctx,
      options.stripePriceId,
      paymentSettings,
      planCache,
      options.planId,
    );
  }

  if (options.planId) {
    let plan = planCache.get(options.planId);
    if (plan === undefined) {
      plan = await ctx.db.get(options.planId);
      planCache.set(options.planId, plan);
    }
    if (plan) {
      return {
        planName: plan.name,
        priceAmount: plan.priceAmount,
        priceCurrency: plan.priceCurrency,
      };
    }
  }

  if (options.isStripeBacked) {
    return resolveLegacyPrice(sub, paymentSettings);
  }

  return { planName: null, priceAmount: null, priceCurrency: null };
}

async function enrichSubscriptionRow(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  sub: Doc<"subscriptions">,
  paymentSettings: Doc<"paymentSettings"> | null,
  planCache: Map<Id<"subscriptionPlans">, Doc<"subscriptionPlans"> | null>,
  userCache: Map<Id<"users">, Doc<"users"> | null>,
) {
  let user = userCache.get(sub.userId);
  if (user === undefined) {
    user = await ctx.db.get(sub.userId);
    userCache.set(sub.userId, user);
  }

  const isAdminGranted = sub.subscriptionId.startsWith("admin-grant-");
  const isStripeBacked = sub.subscriptionId.startsWith("sub_");

  const currentPrice = await resolveSubscriptionPriceDisplay(
    ctx,
    sub,
    paymentSettings,
    planCache,
    {
      stripePriceId: sub.stripePriceId,
      planId: sub.planId,
      isAdminGranted,
      isStripeBacked,
    },
  );

  const hasScheduledRenewalPrice =
    sub.renewalStripePriceId != null &&
    sub.renewalStripePriceId !== sub.stripePriceId;

  const renewalPrice = hasScheduledRenewalPrice
    ? await resolveSubscriptionPriceDisplay(ctx, sub, paymentSettings, planCache, {
        stripePriceId: sub.renewalStripePriceId,
        planId: sub.renewalPlanId,
        isAdminGranted: false,
        isStripeBacked: true,
      })
    : { planName: null, priceAmount: null, priceCurrency: null };

  return finalizeSubscriptionAdminRow({
    subscriptionDocId: sub._id,
    subscriptionId: sub.subscriptionId,
    customerId: sub.customerId,
    userId: sub.userId,
    userName: user?.name?.trim() || null,
    userEmail: user?.email?.trim() || null,
    status: sub.status,
    planId: sub.planId ?? null,
    stripePriceId: sub.stripePriceId ?? null,
    planName: currentPrice.planName,
    priceAmount: currentPrice.priceAmount,
    priceCurrency: currentPrice.priceCurrency,
    renewalPlanName: renewalPrice.planName,
    renewalPriceAmount: renewalPrice.priceAmount,
    renewalPriceCurrency: renewalPrice.priceCurrency,
    hasScheduledRenewalPrice,
    interval: sub.interval ?? null,
    intervalCount: sub.intervalCount ?? null,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    autoRenewEnabled:
      isStripeBacked &&
      (sub.status === "active" || sub.status === "trialing") &&
      !sub.cancelAtPeriodEnd,
    canManageStripe:
      isStripeBacked && (sub.status === "active" || sub.status === "trialing"),
    canceledAt: sub.canceledAt ?? null,
    isAdminGranted,
    isStripeBacked,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
  });
}

type EligibleRenewalPrice = {
  stripePriceId: string;
  planId?: Id<"subscriptionPlans">;
  planName: string;
  priceAmount: number;
  priceCurrency: string;
  billingInterval: "month" | "year";
  isCurrent: boolean;
  isArchived: boolean;
};

function billingIntervalFromSubscription(
  sub: Doc<"subscriptions">,
): "month" | "year" {
  return sub.interval === "year" ? "year" : "month";
}

async function buildEligibleRenewalPrices(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  sub: Doc<"subscriptions">,
): Promise<EligibleRenewalPrice[]> {
  const currentPriceId = sub.stripePriceId ?? undefined;
  const billingInterval = billingIntervalFromSubscription(sub);
  const byPriceId = new Map<string, EligibleRenewalPrice>();

  const addPrice = (option: Omit<EligibleRenewalPrice, "isCurrent">) => {
    if (byPriceId.has(option.stripePriceId)) {
      return;
    }
    byPriceId.set(option.stripePriceId, {
      ...option,
      isCurrent: option.stripePriceId === currentPriceId,
    });
  };

  const addPlanPrices = async (planId: Id<"subscriptionPlans">) => {
    const plan = await ctx.db.get(planId);
    if (!plan || plan.deletedAt !== undefined) {
      return;
    }

    addPrice({
      stripePriceId: plan.stripePriceId,
      planId: plan._id,
      planName: plan.name,
      priceAmount: plan.priceAmount,
      priceCurrency: plan.priceCurrency,
      billingInterval: plan.billingInterval,
      isArchived: false,
    });

    const history = await ctx.db
      .query("subscriptionPlanPriceHistory")
      .withIndex("by_planId", (q) => q.eq("planId", plan._id))
      .collect();

    for (const entry of history) {
      addPrice({
        stripePriceId: entry.stripePriceId,
        planId: plan._id,
        planName: `${plan.name} (archived)`,
        priceAmount: entry.priceAmount,
        priceCurrency: entry.priceCurrency,
        billingInterval: plan.billingInterval,
        isArchived: true,
      });
    }
  };

  if (sub.planId) {
    await addPlanPrices(sub.planId);
  } else if (sub.stripePriceId) {
    const plans = await ctx.db.query("subscriptionPlans").collect();
    let matchedPlanId: Id<"subscriptionPlans"> | null = null;
    for (const plan of plans) {
      if (plan.deletedAt !== undefined) {
        continue;
      }
      if (plan.stripePriceId === sub.stripePriceId) {
        matchedPlanId = plan._id;
        break;
      }
    }
    if (!matchedPlanId) {
      const historyEntries = await ctx.db.query("subscriptionPlanPriceHistory").collect();
      for (const entry of historyEntries) {
        if (entry.stripePriceId === sub.stripePriceId) {
          const plan = await ctx.db.get(entry.planId);
          if (plan && plan.deletedAt === undefined) {
            matchedPlanId = plan._id;
            break;
          }
        }
      }
    }
    if (matchedPlanId) {
      await addPlanPrices(matchedPlanId);
    }
  }

  const activePlans = await ctx.db.query("subscriptionPlans").collect();
  for (const plan of activePlans) {
    if (plan.deletedAt !== undefined || !plan.isActive) {
      continue;
    }
    if (plan.billingInterval !== billingInterval) {
      continue;
    }
    addPrice({
      stripePriceId: plan.stripePriceId,
      planId: plan._id,
      planName: plan.name,
      priceAmount: plan.priceAmount,
      priceCurrency: plan.priceCurrency,
      billingInterval: plan.billingInterval,
      isArchived: false,
    });
  }

  const paymentSettings = await ctx.db.query("paymentSettings").order("desc").first();
  if (paymentSettings) {
    const productName = paymentSettings.productName?.trim() || "Legacy plan";
    if (billingInterval === "month") {
      addPrice({
        stripePriceId: paymentSettings.selectedPriceId,
        planName: `${productName} (Monthly)`,
        priceAmount: paymentSettings.priceAmount,
        priceCurrency: paymentSettings.priceCurrency,
        billingInterval: "month",
        isArchived: false,
      });
    } else if (paymentSettings.selectedYearlyPriceId) {
      addPrice({
        stripePriceId: paymentSettings.selectedYearlyPriceId,
        planName: `${productName} (Yearly)`,
        priceAmount: paymentSettings.yearlyPriceAmount ?? 0,
        priceCurrency:
          paymentSettings.yearlyPriceCurrency ?? paymentSettings.priceCurrency,
        billingInterval: "year",
        isArchived: false,
      });
    }
  }

  return Array.from(byPriceId.values()).sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) {
      return a.isCurrent ? -1 : 1;
    }
    if (a.isArchived !== b.isArchived) {
      return a.isArchived ? 1 : -1;
    }
    return a.planName.localeCompare(b.planName);
  });
}

export const getEligibleRenewalPrices = query({
  args: {
    subscriptionDocId: v.id("subscriptions"),
  },
  returns: v.array(eligibleRenewalPriceValidator),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });

    const sub = await ctx.db.get(args.subscriptionDocId);
    if (!sub) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription not found.",
      });
    }

    if (!sub.subscriptionId.startsWith("sub_")) {
      return [];
    }

    return await buildEligibleRenewalPrices(ctx, sub);
  },
});

export const getSubscriptionByDocIdInternal = internalQuery({
  args: {
    subscriptionDocId: v.id("subscriptions"),
  },
  returns: v.union(
    v.object({
      subscriptionDocId: v.id("subscriptions"),
      subscriptionId: v.string(),
      userId: v.id("users"),
      status: subscriptionStatusValidator,
      currentPeriodStart: v.number(),
      currentPeriodEnd: v.number(),
      cancelAtPeriodEnd: v.boolean(),
      interval: v.union(v.string(), v.null()),
      intervalCount: v.union(v.number(), v.null()),
      planId: v.union(v.id("subscriptionPlans"), v.null()),
      stripePriceId: v.union(v.string(), v.null()),
      renewalStripePriceId: v.union(v.string(), v.null()),
      isStripeBacked: v.boolean(),
      canManageStripe: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionDocId);
    if (!sub) {
      return null;
    }

    const isStripeBacked = sub.subscriptionId.startsWith("sub_");

    return {
      subscriptionDocId: sub._id,
      subscriptionId: sub.subscriptionId,
      userId: sub.userId,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      interval: sub.interval ?? null,
      intervalCount: sub.intervalCount ?? null,
      planId: sub.planId ?? null,
      stripePriceId: sub.stripePriceId ?? null,
      renewalStripePriceId: sub.renewalStripePriceId ?? null,
      isStripeBacked,
      canManageStripe:
        isStripeBacked && (sub.status === "active" || sub.status === "trialing"),
    };
  },
});

export const getEligibleRenewalPriceInternal = internalQuery({
  args: {
    subscriptionDocId: v.id("subscriptions"),
    stripePriceId: v.string(),
  },
  returns: v.union(eligibleRenewalPriceValidator, v.null()),
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionDocId);
    if (!sub) {
      return null;
    }

    const prices = await buildEligibleRenewalPrices(ctx, sub);
    return prices.find((price) => price.stripePriceId === args.stripePriceId) ?? null;
  },
});

export const setScheduledRenewalPriceInternal = internalMutation({
  args: {
    subscriptionDocId: v.id("subscriptions"),
    renewalStripePriceId: v.string(),
    renewalPlanId: v.optional(v.id("subscriptionPlans")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionDocId);
    if (!sub) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription not found.",
      });
    }

    await ctx.db.patch(sub._id, {
      renewalStripePriceId: args.renewalStripePriceId,
      renewalPlanId: args.renewalPlanId,
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const listForTechAdmin = query({
  args: {
    status: v.optional(subscriptionStatusValidator),
    search: v.optional(v.string()),
  },
  returns: v.array(subscriptionRowValidator),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });

    const paymentSettings = await ctx.db.query("paymentSettings").order("desc").first();
    const planCache = new Map<Id<"subscriptionPlans">, Doc<"subscriptionPlans"> | null>();
    const userCache = new Map<Id<"users">, Doc<"users"> | null>();

    const searchTerm = args.search?.trim();
    if (searchTerm) {
      const matchedUsers = await ctx.db
        .query("users")
        .withSearchIndex("search_name", (q) =>
          q.search("name_search", searchTerm).eq("deletedAt", undefined),
        )
        .take(50);

      const rows = [];

      for (const user of matchedUsers) {
        const subs = await ctx.db
          .query("subscriptions")
          .withIndex("userId", (q) => q.eq("userId", user._id))
          .collect();

        for (const sub of subs) {
          if (!isStripeSubscription(sub)) {
            continue;
          }
          if (args.status && sub.status !== args.status) {
            continue;
          }
          rows.push(
            await enrichSubscriptionRow(ctx, sub, paymentSettings, planCache, userCache),
          );
        }
      }

      rows.sort((a, b) => b.updatedAt - a.updatedAt);
      return rows.slice(0, MAX_STRIPE_SUBSCRIPTIONS);
    }

    const subscriptions = args.status
      ? await ctx.db
          .query("subscriptions")
          .withIndex("status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(MAX_STRIPE_SUBSCRIPTIONS * 2)
      : await ctx.db
          .query("subscriptions")
          .order("desc")
          .take(MAX_STRIPE_SUBSCRIPTIONS * 2);

    const rows = [];
    for (const sub of subscriptions) {
      if (!isStripeSubscription(sub)) {
        continue;
      }
      rows.push(
        await enrichSubscriptionRow(ctx, sub, paymentSettings, planCache, userCache),
      );
      if (rows.length >= MAX_STRIPE_SUBSCRIPTIONS) {
        break;
      }
    }

    return rows;
  },
});

const packagePlanOptionValidator = v.object({
  _id: v.id("subscriptionPlans"),
  name: v.string(),
  billingInterval: v.union(v.literal("month"), v.literal("year")),
  priceAmount: v.number(),
  priceCurrency: v.string(),
  isHidden: v.boolean(),
  isActive: v.boolean(),
});

/** Plans available for tech to assign as an internal package override. */
export const listPackagePlansForAssignment = query({
  args: {},
  returns: v.array(packagePlanOptionValidator),
  handler: async (ctx) => {
    await requireUser(ctx, { requireTech: true });

    const plans = await ctx.db.query("subscriptionPlans").collect();
    return plans
      .filter((plan) => plan.deletedAt === undefined)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((plan) => ({
        _id: plan._id,
        name: plan.name,
        billingInterval: plan.billingInterval,
        priceAmount: plan.priceAmount,
        priceCurrency: plan.priceCurrency,
        isHidden: plan.isHidden === true,
        isActive: plan.isActive,
      }));
  },
});

/**
 * Tech admin: set the internal package plan for a Stripe subscription without
 * changing the Stripe price (override used when Stripe price is unlinked).
 */
export const setInternalPackagePlan = mutation({
  args: {
    subscriptionDocId: v.id("subscriptions"),
    planId: v.id("subscriptionPlans"),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });

    const sub = await ctx.db.get(args.subscriptionDocId);
    if (!sub) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription not found.",
      });
    }

    if (!sub.subscriptionId.startsWith("sub_")) {
      throw new ConvexError({
        code: "INVALID",
        message: "Only Stripe-backed subscriptions can receive a package override.",
      });
    }

    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.deletedAt !== undefined) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Package plan not found.",
      });
    }

    const user = await ctx.db.get(sub.userId);
    if (!user || user.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found.",
      });
    }

    await ctx.db.patch(args.subscriptionDocId, {
      planId: args.planId,
      legacyMigrationStatus: undefined,
      legacyMigratedAt: undefined,
      updatedAt: Date.now(),
    });

    if (user.subscriptionModel !== SUBSCRIPTION_MODEL.PACKAGES) {
      await ctx.db.patch(sub.userId, {
        subscriptionModel: SUBSCRIPTION_MODEL.PACKAGES,
      });
    }

    await ctx.scheduler.runAfter(0, internal.mailchimp.syncUserToMailchimp, {
      userId: sub.userId,
    });

    return {
      success: true,
      message: `Internal package set to "${plan.name}". Stripe billing price was left unchanged.`,
    };
  },
});
