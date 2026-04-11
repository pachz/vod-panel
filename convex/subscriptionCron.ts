import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * Expire subscriptions whose current period has ended: set status to "canceled"
 * when status is "active" or "trialing" and currentPeriodEnd < now.
 * Runs daily via convex/crons.ts.
 *
 * Stripe-backed rows (`sub_*`) are skipped: Stripe (and syncAllSubscriptionsFromStripe)
 * are the source of truth. A local midnight cancel races renewals that complete later
 * the same calendar day and breaks users who resubscribe under a new subscription id.
 */
export const expireEndedSubscriptions = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const active = await ctx.db
      .query("subscriptions")
      .withIndex("status", (q) => q.eq("status", "active"))
      .collect();
    const trialing = await ctx.db
      .query("subscriptions")
      .withIndex("status", (q) => q.eq("status", "trialing"))
      .collect();
    for (const sub of [...active, ...trialing]) {
      if (sub.subscriptionId.startsWith("sub_")) {
        continue;
      }
      if (sub.currentPeriodEnd < now) {
        await ctx.db.patch(sub._id, { status: "canceled", updatedAt: now });
        await ctx.scheduler.runAfter(0, internal.mailchimp.syncUserToMailchimp, {
          userId: sub.userId,
        });
      }
    }
    return null;
  },
});
