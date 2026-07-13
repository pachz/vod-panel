import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { buildRuntimeSystemInstructions } from "./promptData";

export const getSystemInstructions = internalQuery({
  args: {
    userId: v.id("users"),
    nowMs: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    return await buildRuntimeSystemInstructions(ctx, args.userId, args.nowMs);
  },
});
