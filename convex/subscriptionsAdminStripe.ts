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
