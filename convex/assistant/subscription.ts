import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mapSubscriptionStatus } from "./lib";
import { subscriptionToolResultValidator } from "./validators";
import { pickPrimarySubscriptionForUserDisplay } from "../paymentInternal";

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
