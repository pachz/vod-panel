import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { assistantAudienceValidator } from "./audience";
import { buildRuntimeSystemInstructions } from "./promptData";
import { assistantLanguageValidator } from "./validators";

export const getSystemInstructions = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    nowMs: v.number(),
    language: v.optional(assistantLanguageValidator),
    audience: v.optional(assistantAudienceValidator),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const audience = args.audience ?? "members";
    if (audience === "members" && !args.userId) {
      throw new Error("Member assistant requires a user id");
    }

    return await buildRuntimeSystemInstructions(
      ctx,
      args.userId ?? null,
      args.nowMs,
      args.language,
      audience,
    );
  },
});
