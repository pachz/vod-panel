import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Expire subscriptions whose current period has ended: set status to "canceled"
 * when status is "active" or "trialing" and currentPeriodEnd < now.
 * Runs daily via convex/crons.ts.
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
      if (sub.currentPeriodEnd < now) {
        await ctx.db.patch(sub._id, { status: "canceled", updatedAt: now });
      }
    }
    return null;
  },
});
