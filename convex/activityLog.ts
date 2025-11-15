import { query } from "./_generated/server";
import { requireUser } from "./utils/auth";
import { v } from "convex/values";

export const getActivityLogs = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 50 }) => {
    await requireUser(ctx);

    const logs = await ctx.db
      .query("activityLogs")
      .withIndex("timestamp", (q) => q)
      .order("desc")
      .take(limit);

    return logs;
  },
});

