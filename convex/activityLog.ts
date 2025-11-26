import { query } from "./_generated/server";
import { requireUser } from "./utils/auth";
import { v } from "convex/values";

type RequireUserReturn = Awaited<ReturnType<typeof requireUser>>;

export const getActivityLogs = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 50 }) => {
    const { user } = (await requireUser(ctx)) as RequireUserReturn & {
      user: { isGod?: boolean };
    };

    if (!user?.isGod) {
      return [];
    }

    const logs = await ctx.db
      .query("activityLogs")
      .withIndex("timestamp", (q) => q)
      .order("desc")
      .take(limit);

    return logs;
  },
});

