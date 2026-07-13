import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { loadUserContext } from "./promptData";

export const getUserContextInternal = internalQuery({
  args: {
    userId: v.id("users"),
    nowMs: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    return await loadUserContext(ctx, args.userId, args.nowMs);
  },
});
