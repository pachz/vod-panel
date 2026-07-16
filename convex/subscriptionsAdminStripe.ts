"use node";

import { action } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import Stripe from "stripe";
import { internal } from "./_generated/api";
import { requireUserAction } from "./utils/auth";

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

async function requireTechAction(ctx: import("./_generated/server").ActionCtx) {
  await requireUserAction(ctx);
  await ctx.runQuery(internal.user.requireTechQuery, {});
}

const stripeComparisonStatusValidator = v.union(
  v.literal("active"),
  v.literal("canceled"),
  v.literal("past_due"),
  v.literal("unpaid"),
  v.literal("incomplete"),
  v.literal("trialing"),
);

const stripeComparisonRowValidator = v.object({
  stripeSubscriptionId: v.string(),
  stripeCustomerId: v.string(),
  stripeCustomerEmail: v.union(v.string(), v.null()),
  stripeStatus: stripeComparisonStatusValidator,
  stripePriceId: v.union(v.string(), v.null()),
  stripeCurrentPeriodStart: v.number(),
  stripeCurrentPeriodEnd: v.number(),
  stripeCancelAtPeriodEnd: v.boolean(),
  localSubscriptionDocId: v.union(v.id("subscriptions"), v.null()),
  localUserId: v.union(v.id("users"), v.null()),
  localUserName: v.union(v.string(), v.null()),
  localUserEmail: v.union(v.string(), v.null()),
  localStatus: v.union(stripeComparisonStatusValidator, v.null()),
  localCurrentPeriodStart: v.union(v.number(), v.null()),
  localCurrentPeriodEnd: v.union(v.number(), v.null()),
  localCancelAtPeriodEnd: v.union(v.boolean(), v.null()),
  localStripePriceId: v.union(v.string(), v.null()),
  localRenewalStripePriceId: v.union(v.string(), v.null()),
  localPlanId: v.union(v.id("subscriptionPlans"), v.null()),
  localPlanName: v.union(v.string(), v.null()),
  legacyMigrationStatus: v.union(v.literal("migrated"), v.null()),
  stripePriceLinkedToPlan: v.boolean(),
  needsPackageAssignment: v.boolean(),
  mappedUserId: v.union(v.id("users"), v.null()),
  mappedUserName: v.union(v.string(), v.null()),
  mappedUserEmail: v.union(v.string(), v.null()),
  inSync: v.boolean(),
  syncNeeded: v.boolean(),
  canSync: v.boolean(),
  syncReasons: v.array(v.string()),
  expectedDifferences: v.array(v.string()),
});

const stripePriceDisplayValidator = v.object({
  stripePriceId: v.string(),
  planName: v.union(v.string(), v.null()),
  priceAmount: v.union(v.number(), v.null()),
  priceCurrency: v.union(v.string(), v.null()),
  interval: v.union(v.string(), v.null()),
});

function displayNameFromStripePrice(price: Stripe.Price): string | null {
  const product = price.product;
  if (typeof product === "string" || "deleted" in product) {
    return null;
  }
  return product.name?.trim() || null;
}

function normalizeStripeStatusForComparison(
  status: Stripe.Subscription.Status,
): "active" | "canceled" | "past_due" | "unpaid" | "incomplete" | "trialing" {
  switch (status) {
    case "active":
    case "canceled":
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "trialing":
      return status;
    case "incomplete_expired":
      return "incomplete";
    case "paused":
      return "active";
    default:
      return "canceled";
  }
}

function stripePriceIdFromSubscription(sub: Stripe.Subscription): string | null {
  const price = sub.items.data[0]?.price;
  if (!price) {
    return null;
  }
  return typeof price === "string" ? price : price.id ?? null;
}

function stripePeriodMs(sub: Stripe.Subscription): { start: number; end: number } {
  const startRaw =
    (sub as { current_period_start?: number }).current_period_start ??
    sub.items.data[0]?.current_period_start;
  const endRaw =
    (sub as { current_period_end?: number }).current_period_end ??
    sub.items.data[0]?.current_period_end;

  const start = typeof startRaw === "number" && startRaw > 0 ? startRaw * 1000 : 0;
  const end = typeof endRaw === "number" && endRaw > 0 ? endRaw * 1000 : 0;
  return { start, end };
}

function timestampsDiffer(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) {
    return a !== b;
  }
  return Math.abs(a - b) > 1000;
}

function buildStripeComparisonRow(
  sub: Stripe.Subscription,
  local: {
    subscriptionDocId: Id<"subscriptions">;
    userId: Id<"users">;
    status: "active" | "canceled" | "past_due" | "unpaid" | "incomplete" | "trialing";
    currentPeriodStart: number;
    currentPeriodEnd: number;
    cancelAtPeriodEnd: boolean;
    stripePriceId: string | null;
    renewalStripePriceId: string | null;
    planId: Id<"subscriptionPlans"> | null;
    planName: string | null;
    legacyMigrationStatus: "migrated" | null;
    userName: string | null;
    userEmail: string | null;
  } | null,
  mappedUser: {
    userId: Id<"users">;
    userName: string | null;
    userEmail: string | null;
  } | null,
  stripePriceLinkedToPlan: boolean,
): {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripeCustomerEmail: string | null;
  stripeStatus: "active" | "canceled" | "past_due" | "unpaid" | "incomplete" | "trialing";
  stripePriceId: string | null;
  stripeCurrentPeriodStart: number;
  stripeCurrentPeriodEnd: number;
  stripeCancelAtPeriodEnd: boolean;
  localSubscriptionDocId: Id<"subscriptions"> | null;
  localUserId: Id<"users"> | null;
  localUserName: string | null;
  localUserEmail: string | null;
  localStatus: "active" | "canceled" | "past_due" | "unpaid" | "incomplete" | "trialing" | null;
  localCurrentPeriodStart: number | null;
  localCurrentPeriodEnd: number | null;
  localCancelAtPeriodEnd: boolean | null;
  localStripePriceId: string | null;
  localRenewalStripePriceId: string | null;
  localPlanId: Id<"subscriptionPlans"> | null;
  localPlanName: string | null;
  legacyMigrationStatus: "migrated" | null;
  stripePriceLinkedToPlan: boolean;
  needsPackageAssignment: boolean;
  mappedUserId: Id<"users"> | null;
  mappedUserName: string | null;
  mappedUserEmail: string | null;
  inSync: boolean;
  syncNeeded: boolean;
  canSync: boolean;
  syncReasons: string[];
  expectedDifferences: string[];
} {
  const customerRaw = sub.customer;
  const stripeCustomerId =
    typeof customerRaw === "string" ? customerRaw : customerRaw?.id ?? "";
  const stripeCustomerEmail =
    customerRaw &&
    typeof customerRaw === "object" &&
    "email" in customerRaw &&
    typeof customerRaw.email === "string"
      ? customerRaw.email
      : null;

  const stripeStatus = normalizeStripeStatusForComparison(sub.status);
  const stripePriceId = stripePriceIdFromSubscription(sub);
  const { start, end } = stripePeriodMs(sub);
  const stripeCancelAtPeriodEnd = Boolean(
    (sub as { cancel_at_period_end?: boolean }).cancel_at_period_end,
  );

  const syncReasons: string[] = [];
  const expectedDifferences: string[] = [];

  if (!local) {
    syncReasons.push("Missing in database");
  } else {
    if (local.status !== stripeStatus) {
      syncReasons.push(`Status: Stripe "${stripeStatus}" vs local "${local.status}"`);
    }
    if (timestampsDiffer(local.currentPeriodStart, start)) {
      syncReasons.push("Current period start differs");
    }
    if (timestampsDiffer(local.currentPeriodEnd, end)) {
      syncReasons.push("Current period end differs");
    }
    if (local.cancelAtPeriodEnd !== stripeCancelAtPeriodEnd) {
      syncReasons.push("Cancel-at-period-end flag differs");
    }
    if (
      stripePriceId &&
      local.stripePriceId &&
      local.stripePriceId !== stripePriceId
    ) {
      if (local.legacyMigrationStatus === "migrated") {
        syncReasons.push(
          "Stripe price id differs (legacy migration lock — sync will reset migration)",
        );
      } else if (local.renewalStripePriceId === stripePriceId) {
        syncReasons.push(
          "Stripe price id differs (scheduled renewal — sync will align to Stripe)",
        );
      } else {
        syncReasons.push("Stripe price id differs");
      }
    }
    if (mappedUser && local.userId !== mappedUser.userId) {
      syncReasons.push("Local user does not match Stripe customer mapping");
    }

    const priceMatches =
      !stripePriceId ||
      !local.stripePriceId ||
      local.stripePriceId === stripePriceId;

    if (priceMatches && stripePriceId && !stripePriceLinkedToPlan) {
      if (local.planId) {
        expectedDifferences.push(
          `Internal package override: "${local.planName ?? local.planId}" (Stripe price not linked)`,
        );
      } else {
        expectedDifferences.push(
          "Stripe price is not linked to a package — assign an internal package for access",
        );
      }
    }

    if (priceMatches && local.legacyMigrationStatus === "migrated") {
      syncReasons.push("Legacy migration flag still set — sync will clear it");
    }
  }

  if (!mappedUser && !local) {
    syncReasons.push("No Convex user mapped to Stripe customer");
  }

  const needsPackageAssignment =
    Boolean(local) &&
    Boolean(stripePriceId) &&
    !stripePriceLinkedToPlan &&
    local?.planId == null &&
    (!local?.stripePriceId || local.stripePriceId === stripePriceId);

  const resolvedUserId = local?.userId ?? mappedUser?.userId ?? null;
  const canSync = resolvedUserId != null;
  // Package assignment is a separate action from Stripe sync.
  const syncNeeded = syncReasons.length > 0;
  const inSync = local != null && !syncNeeded && !needsPackageAssignment;

  return {
    stripeSubscriptionId: sub.id,
    stripeCustomerId,
    stripeCustomerEmail,
    stripeStatus,
    stripePriceId,
    stripeCurrentPeriodStart: start,
    stripeCurrentPeriodEnd: end,
    stripeCancelAtPeriodEnd,
    localSubscriptionDocId: local?.subscriptionDocId ?? null,
    localUserId: local?.userId ?? null,
    localUserName: local?.userName ?? null,
    localUserEmail: local?.userEmail ?? null,
    localStatus: local?.status ?? null,
    localCurrentPeriodStart: local?.currentPeriodStart ?? null,
    localCurrentPeriodEnd: local?.currentPeriodEnd ?? null,
    localCancelAtPeriodEnd: local?.cancelAtPeriodEnd ?? null,
    localStripePriceId: local?.stripePriceId ?? null,
    localRenewalStripePriceId: local?.renewalStripePriceId ?? null,
    localPlanId: local?.planId ?? null,
    localPlanName: local?.planName ?? null,
    legacyMigrationStatus: local?.legacyMigrationStatus ?? null,
    stripePriceLinkedToPlan,
    needsPackageAssignment,
    mappedUserId: mappedUser?.userId ?? null,
    mappedUserName: mappedUser?.userName ?? null,
    mappedUserEmail: mappedUser?.userEmail ?? null,
    inSync,
    syncNeeded,
    canSync,
    syncReasons,
    expectedDifferences,
  };
}

type LocalSubscriptionComparison = {
  subscriptionDocId: Id<"subscriptions">;
  subscriptionId: string;
  userId: Id<"users">;
  customerId: string;
  status: "active" | "canceled" | "past_due" | "unpaid" | "incomplete" | "trialing";
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  stripePriceId: string | null;
  renewalStripePriceId: string | null;
  planId: Id<"subscriptionPlans"> | null;
  planName: string | null;
  legacyMigrationStatus: "migrated" | null;
  userName: string | null;
  userEmail: string | null;
  updatedAt: number;
};

type StripeComparisonRow = ReturnType<typeof buildStripeComparisonRow>;

type StripeComparisonPage = {
  items: StripeComparisonRow[];
  hasMore: boolean;
  nextStartingAfter: string | null;
};

async function buildComparisonRowForStripeSubscription(
  ctx: import("./_generated/server").ActionCtx,
  sub: Stripe.Subscription,
): Promise<StripeComparisonRow> {
  const local: LocalSubscriptionComparison | null = await ctx.runQuery(
    internal.paymentInternal.getLocalSubscriptionForComparison,
    {
      subscriptionId: sub.id,
    },
  );

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? "";
  let mappedUser: {
    userId: Id<"users">;
    userName: string | null;
    userEmail: string | null;
  } | null = null;

  if (customerId) {
    const mappedUserId: Id<"users"> | null = await ctx.runQuery(
      internal.paymentInternal.getUserIdByStripeCustomerId,
      { customerId },
    );
    if (mappedUserId) {
      const user = await ctx.runQuery(internal.paymentInternal.getUserDisplayInfo, {
        userId: mappedUserId,
      });
      mappedUser = {
        userId: mappedUserId,
        userName: user?.userName ?? null,
        userEmail: user?.userEmail ?? null,
      };
    }
  }

  const stripePriceId = stripePriceIdFromSubscription(sub);
  const linkedPlanId: Id<"subscriptionPlans"> | null = stripePriceId
    ? await ctx.runQuery(internal.plansInternal.resolvePlanFromStripePriceId, {
        stripePriceId,
      })
    : null;

  return buildStripeComparisonRow(sub, local, mappedUser, linkedPlanId != null);
}

export const getStripeSubscriptionComparisonRow = action({
  args: {
    subscriptionId: v.string(),
  },
  returns: stripeComparisonRowValidator,
  handler: async (ctx, args): Promise<StripeComparisonRow> => {
    await requireTechAction(ctx);

    if (!args.subscriptionId.startsWith("sub_")) {
      throw new ConvexError({
        code: "INVALID_ID",
        message: "Invalid Stripe subscription id.",
      });
    }

    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(args.subscriptionId, {
      expand: ["customer", "items.data.price"],
    });

    return await buildComparisonRowForStripeSubscription(ctx, sub);
  },
});

const userStripeDetailsValidator = v.object({
  success: v.boolean(),
  message: v.string(),
  comparison: v.optional(stripeComparisonRowValidator),
  canManageStripe: v.optional(v.boolean()),
  stripePriceDisplay: v.optional(stripePriceDisplayValidator),
  renewalPriceDisplay: v.optional(stripePriceDisplayValidator),
});

function pickBestStripeSubscription(
  subs: Stripe.Subscription[],
): Stripe.Subscription | null {
  if (subs.length === 0) {
    return null;
  }
  const rank = (status: Stripe.Subscription.Status) => {
    if (status === "active" || status === "trialing") {
      return 3;
    }
    if (status === "past_due") {
      return 2;
    }
    if (status === "canceled") {
      return 1;
    }
    return 0;
  };
  return [...subs].sort((a, b) => {
    const statusDiff = rank(b.status) - rank(a.status);
    if (statusDiff !== 0) {
      return statusDiff;
    }
    return b.created - a.created;
  })[0];
}

/**
 * Tech admin: load live Stripe subscription data for a user and compare with Convex.
 */
export const fetchUserStripeSubscriptionDetails = action({
  args: {
    userId: v.id("users"),
  },
  returns: userStripeDetailsValidator,
  handler: async (ctx, args): Promise<{
    success: boolean;
    message: string;
    comparison?: StripeComparisonRow;
    canManageStripe?: boolean;
    stripePriceDisplay?: {
      stripePriceId: string;
      planName: string | null;
      priceAmount: number | null;
      priceCurrency: string | null;
      interval: string | null;
    };
    renewalPriceDisplay?: {
      stripePriceId: string;
      planName: string | null;
      priceAmount: number | null;
      priceCurrency: string | null;
      interval: string | null;
    };
  }> => {
    await requireTechAction(ctx);

    const user = await ctx.runQuery(internal.paymentInternal.getUserWithCustomer, {
      userId: args.userId,
    });
    if (!user) {
      return { success: false, message: "User not found." };
    }
    if (!user.stripeCustomerId) {
      return { success: false, message: "User does not have a Stripe customer ID." };
    }

    const stripe = getStripe();
    const anchor = await ctx.runQuery(
      internal.paymentInternal.getStripeSubscriptionAnchorForAdminSync,
      { userId: args.userId },
    );

    let sub: Stripe.Subscription | null = null;
    if (anchor) {
      try {
        sub = await stripe.subscriptions.retrieve(anchor.subscriptionId, {
          expand: ["customer", "items.data.price"],
        });
      } catch (error) {
        console.error("Failed to retrieve anchored Stripe subscription:", error);
      }
    }

    if (!sub) {
      const listed = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: "all",
        limit: 20,
        expand: ["data.customer", "data.items.data.price"],
      });
      sub = pickBestStripeSubscription(listed.data);
    }

    if (!sub) {
      return {
        success: false,
        message: "No Stripe subscription found for this customer.",
      };
    }

    const comparison = await buildComparisonRowForStripeSubscription(ctx, sub);
    const canManageStripe =
      comparison.stripeStatus === "active" || comparison.stripeStatus === "trialing";

    const priceIdsToLookup = new Set<string>();
    if (comparison.stripePriceId) {
      priceIdsToLookup.add(comparison.stripePriceId);
    }
    if (
      comparison.localRenewalStripePriceId &&
      comparison.localRenewalStripePriceId !== comparison.stripePriceId
    ) {
      priceIdsToLookup.add(comparison.localRenewalStripePriceId);
    }

    const displays = new Map<
      string,
      {
        stripePriceId: string;
        planName: string | null;
        priceAmount: number | null;
        priceCurrency: string | null;
        interval: string | null;
      }
    >();

    for (const stripePriceId of priceIdsToLookup) {
      try {
        const price = await stripe.prices.retrieve(stripePriceId, {
          expand: ["product"],
        });
        displays.set(stripePriceId, {
          stripePriceId,
          planName: displayNameFromStripePrice(price),
          priceAmount: price.unit_amount ?? null,
          priceCurrency: price.currency ?? null,
          interval: price.recurring?.interval ?? null,
        });
      } catch (error) {
        console.error(`Failed to retrieve Stripe price ${stripePriceId}:`, error);
      }
    }

    return {
      success: true,
      message: "Loaded subscription data from Stripe.",
      comparison,
      canManageStripe,
      stripePriceDisplay: comparison.stripePriceId
        ? displays.get(comparison.stripePriceId)
        : undefined,
      renewalPriceDisplay:
        comparison.localRenewalStripePriceId &&
        comparison.localRenewalStripePriceId !== comparison.stripePriceId
          ? displays.get(comparison.localRenewalStripePriceId)
          : undefined,
    };
  },
});

export const listStripeSubscriptionComparison = action({
  args: {
    startingAfter: v.optional(v.string()),
    limit: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("all"),
        v.literal("active"),
        v.literal("canceled"),
        v.literal("past_due"),
        v.literal("unpaid"),
        v.literal("incomplete"),
        v.literal("trialing"),
      ),
    ),
  },
  returns: v.object({
    items: v.array(stripeComparisonRowValidator),
    hasMore: v.boolean(),
    nextStartingAfter: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<StripeComparisonPage> => {
    await requireTechAction(ctx);

    const stripe = getStripe();
    const pageLimit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    const statusFilter = args.status ?? "all";

    const page = await stripe.subscriptions.list({
      status: statusFilter === "all" ? "all" : statusFilter,
      limit: pageLimit,
      ...(args.startingAfter ? { starting_after: args.startingAfter } : {}),
      expand: ["data.customer", "data.items.data.price"],
    });

    const items: StripeComparisonRow[] = [];

    for (const sub of page.data) {
      items.push(await buildComparisonRowForStripeSubscription(ctx, sub));
    }

    const nextStartingAfter =
      page.has_more && page.data.length > 0 ? page.data[page.data.length - 1]!.id : null;

    return {
      items,
      hasMore: page.has_more,
      nextStartingAfter,
    };
  },
});

export const setAutoRenewal = action({
  args: {
    subscriptionDocId: v.id("subscriptions"),
    autoRenew: v.boolean(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    autoRenewEnabled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireTechAction(ctx);

    const sub = await ctx.runQuery(internal.subscriptionsAdmin.getSubscriptionByDocIdInternal, {
      subscriptionDocId: args.subscriptionDocId,
    });

    if (!sub) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription not found.",
      });
    }

    if (!sub.canManageStripe) {
      throw new ConvexError({
        code: "NOT_MANAGEABLE",
        message: "Only active Stripe subscriptions can be updated.",
      });
    }

    const stripe = getStripe();
    const updated = await stripe.subscriptions.update(sub.subscriptionId, {
      cancel_at_period_end: !args.autoRenew,
    });

    const updatedPeriodStart = (updated as { current_period_start?: number }).current_period_start;
    const updatedPeriodEnd = (updated as { current_period_end?: number }).current_period_end;
    const cancelAtPeriodEnd = Boolean(
      (updated as { cancel_at_period_end?: boolean }).cancel_at_period_end,
    );
    const canceledAtRaw = (updated as { canceled_at?: number | null }).canceled_at;

    await ctx.runMutation(internal.paymentInternal.upsertSubscription, {
      subscriptionId: updated.id,
      userId: sub.userId,
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
        updatedPeriodStart != null ? updatedPeriodStart * 1000 : sub.currentPeriodStart,
      currentPeriodEnd:
        updatedPeriodEnd != null ? updatedPeriodEnd * 1000 : sub.currentPeriodEnd,
      cancelAtPeriodEnd,
      canceledAt: canceledAtRaw ? canceledAtRaw * 1000 : undefined,
      interval: sub.interval ?? undefined,
      intervalCount: sub.intervalCount ?? undefined,
      planId: sub.planId ?? undefined,
      stripePriceId: sub.stripePriceId ?? undefined,
    });

    return {
      success: true,
      autoRenewEnabled: !cancelAtPeriodEnd,
      message: args.autoRenew
        ? "Auto-renewal enabled for this subscription."
        : "Auto-renewal disabled. Subscription will end at the current period.",
    };
  },
});

export const setRenewalPrice = action({
  args: {
    subscriptionDocId: v.id("subscriptions"),
    stripePriceId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    message: string;
  }> => {
    await requireTechAction(ctx);

    const sub = await ctx.runQuery(internal.subscriptionsAdmin.getSubscriptionByDocIdInternal, {
      subscriptionDocId: args.subscriptionDocId,
    });

    if (!sub) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription not found.",
      });
    }

    if (!sub.canManageStripe) {
      throw new ConvexError({
        code: "NOT_MANAGEABLE",
        message: "Only active Stripe subscriptions can be updated.",
      });
    }

    type EligibleRenewalPrice = {
      stripePriceId: string;
      planId?: Id<"subscriptionPlans">;
      planName: string;
      priceAmount: number;
      priceCurrency: string;
      billingInterval: "month" | "year";
    };

    const selectedPrice: EligibleRenewalPrice | null = await ctx.runQuery(
      internal.subscriptionsAdmin.getEligibleRenewalPriceInternal,
      {
        subscriptionDocId: args.subscriptionDocId,
        stripePriceId: args.stripePriceId,
      },
    );

    if (!selectedPrice) {
      throw new ConvexError({
        code: "INVALID_PRICE",
        message: "Selected price is not eligible for this subscription.",
      });
    }

    if (
      selectedPrice.stripePriceId === sub.stripePriceId ||
      selectedPrice.stripePriceId === sub.renewalStripePriceId
    ) {
      throw new ConvexError({
        code: "NO_CHANGE",
        message: "Subscription is already on this price.",
      });
    }

    const stripe = getStripe();
    const stripeSubscription = await stripe.subscriptions.retrieve(sub.subscriptionId, {
      expand: ["items.data.price"],
    });
    const itemId = stripeSubscription.items.data[0]?.id;
    if (!itemId) {
      throw new ConvexError({
        code: "STRIPE_ERROR",
        message: "Could not resolve subscription item.",
      });
    }

    const updated = await stripe.subscriptions.update(sub.subscriptionId, {
      items: [{ id: itemId, price: selectedPrice.stripePriceId }],
      proration_behavior: "none",
    });

    const updatedPeriodStart = (updated as { current_period_start?: number }).current_period_start;
    const updatedPeriodEnd = (updated as { current_period_end?: number }).current_period_end;

    await ctx.runMutation(internal.subscriptionsAdmin.setScheduledRenewalPriceInternal, {
      subscriptionDocId: args.subscriptionDocId,
      renewalStripePriceId: selectedPrice.stripePriceId,
      renewalPlanId: selectedPrice.planId,
    });

    await ctx.runMutation(internal.paymentInternal.upsertSubscription, {
      subscriptionId: updated.id,
      userId: sub.userId,
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
        updatedPeriodStart != null ? updatedPeriodStart * 1000 : sub.currentPeriodStart,
      currentPeriodEnd:
        updatedPeriodEnd != null ? updatedPeriodEnd * 1000 : sub.currentPeriodEnd,
      cancelAtPeriodEnd: Boolean(
        (updated as { cancel_at_period_end?: boolean }).cancel_at_period_end,
      ),
      canceledAt: (updated as { canceled_at?: number | null }).canceled_at
        ? (updated as { canceled_at: number }).canceled_at * 1000
        : undefined,
      interval: selectedPrice.billingInterval,
      intervalCount: 1,
    });

    return {
      success: true,
      message: `Renewal price updated to ${selectedPrice.planName}. The new price applies on the next billing cycle.`,
    };
  },
});

/** Resolve display fields for Stripe price IDs not linked to internal plans. */
export const lookupStripePriceDisplays = action({
  args: {
    stripePriceIds: v.array(v.string()),
  },
  returns: v.array(stripePriceDisplayValidator),
  handler: async (ctx, args) => {
    await requireTechAction(ctx);

    const uniqueIds = [...new Set(args.stripePriceIds.filter((id) => id.startsWith("price_")))];
    if (uniqueIds.length === 0) {
      return [];
    }

    const stripe = getStripe();
    const results: Array<{
      stripePriceId: string;
      planName: string | null;
      priceAmount: number | null;
      priceCurrency: string | null;
      interval: string | null;
    }> = [];

    for (const stripePriceId of uniqueIds) {
      try {
        const price = await stripe.prices.retrieve(stripePriceId, {
          expand: ["product"],
        });
        results.push({
          stripePriceId,
          planName: displayNameFromStripePrice(price),
          priceAmount: price.unit_amount ?? null,
          priceCurrency: price.currency ?? null,
          interval: price.recurring?.interval ?? null,
        });
      } catch (error) {
        console.error(`Failed to retrieve Stripe price ${stripePriceId}:`, error);
        results.push({
          stripePriceId,
          planName: null,
          priceAmount: null,
          priceCurrency: null,
          interval: null,
        });
      }
    }

    return results;
  },
});
