import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireUser } from "../utils/auth";
import {
  ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS,
  ASSISTANT_FIXED_INSTRUCTIONS,
  loadCustomInstructions,
} from "./promptData";

const SETTINGS_KEY = "global" as const;
const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 8000;

async function getSettingsDoc(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("assistantSettings")
    .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
    .unique();
}

export const getCustomInstructionsInternal = internalQuery({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    return await loadCustomInstructions(ctx);
  },
});

export const getAssistantSettings = query({
  args: {},
  returns: v.object({
    customInstructions: v.string(),
    fixedInstructions: v.string(),
    defaultCustomInstructions: v.string(),
    updatedAt: v.optional(v.number()),
  }),
  handler: async (ctx) => {
    await requireUser(ctx, { requireTech: true });

    const settings = await getSettingsDoc(ctx);
    return {
      customInstructions: settings?.customInstructions ?? ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS,
      fixedInstructions: ASSISTANT_FIXED_INSTRUCTIONS,
      defaultCustomInstructions: ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS,
      updatedAt: settings?.updatedAt,
    };
  },
});

export const updateAssistantSettings = mutation({
  args: {
    customInstructions: v.string(),
  },
  returns: v.object({
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Authentication required");
    }

    const customInstructions = args.customInstructions.trim();
    if (customInstructions.length === 0) {
      throw new Error("Custom instructions cannot be empty");
    }

    if (customInstructions.length > MAX_CUSTOM_INSTRUCTIONS_LENGTH) {
      throw new Error(
        `Custom instructions must be at most ${MAX_CUSTOM_INSTRUCTIONS_LENGTH} characters`,
      );
    }

    const now = Date.now();
    const existing = await getSettingsDoc(ctx);

    if (existing) {
      await ctx.db.patch(existing._id, {
        customInstructions,
        updatedAt: now,
        updatedBy: userId,
      });
    } else {
      await ctx.db.insert("assistantSettings", {
        key: SETTINGS_KEY,
        customInstructions,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    return { updatedAt: now };
  },
});
