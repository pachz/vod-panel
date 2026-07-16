import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { buildRuntimeSystemInstructions } from "./promptData";
import { assistantLanguageValidator } from "./validators";

export const getSystemInstructions = internalQuery({
  args: {
    userId: v.id("users"),
    nowMs: v.number(),
    language: v.optional(assistantLanguageValidator),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    return await buildRuntimeSystemInstructions(
      ctx,
      args.userId,
      args.nowMs,
      args.language,
    );
  },
});
