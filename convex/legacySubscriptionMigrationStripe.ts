"use node";

import { action } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import Stripe from "stripe";
import { requireUserAction } from "./utils/auth";
import { internal } from "./_generated/api";

const migrationResultValidator = v.object({
  userId: v.id("users"),
  success: v.boolean(),
  message: v.string(),
});

/**
 * Migrate one legacy Stripe subscription to the package model.
 */
export const migrateLegacyStripeSubscription = action({
  args: {
    userId: v.id("users"),
    subscriptionDocId: v.id("subscriptions"),
    targetPlanId: v.id("subscriptionPlans"),
  },
  returns: migrationResultValidator,
  handler: async (ctx, args): Promise<{
    userId: Id<"users">;
    success: boolean;
    message: string;
  }> => {
    await requireUserAction(ctx);
    await ctx.runQuery(internal.user.requireTechQuery, {});

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new ConvexError({
        code: "CONFIG",
        message: "STRIPE_SECRET_KEY is not configured.",
      });
    }

    const plan = await ctx.runQuery(internal.plansInternal.getPlanByIdInternal, {
      planId: args.targetPlanId,
    });
    if (!plan || plan.deletedAt !== undefined) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Target plan not found." });
    }

    const sub = await ctx.runQuery(
      internal.legacySubscriptionMigration.getSubscriptionForMigrationInternal,
      { subscriptionDocId: args.subscriptionDocId },
    );
    if (!sub || sub.userId !== args.userId) {
      return {
        userId: args.userId,
        success: false,
        message: "Subscription not found.",
      };
    }

    if (sub.legacyMigrationStatus === "migrated") {
      return {
        userId: args.userId,
        success: true,
        message: "Already migrated.",
      };
    }

    if (!sub.subscriptionId.startsWith("sub_")) {
      return {
        userId: args.userId,
        success: false,
        message: "Not a Stripe subscription.",
      };
    }

    const stripe = new Stripe(stripeSecretKey);

    try {
      const updated = await stripe.subscriptions.update(sub.subscriptionId, {
        cancel_at_period_end: true,
      });

      await ctx.runMutation(
        internal.legacySubscriptionMigration.applyLegacyPackageMigrationInternal,
        {
          userId: args.userId,
          subscriptionDocId: args.subscriptionDocId,
          targetPlanId: args.targetPlanId,
          cancelAtPeriodEnd: Boolean(updated.cancel_at_period_end),
        },
      );

      return {
        userId: args.userId,
        success: true,
        message: "Migrated successfully.",
      };
    } catch (error) {
      return {
        userId: args.userId,
        success: false,
        message: error instanceof Error ? error.message : "Migration failed",
      };
    }
  },
});
