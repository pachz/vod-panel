import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { loadUserMemory } from "./promptData";

export const MAX_USER_MEMORY_LENGTH = 4000;

export const getUserMemoryInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    return await loadUserMemory(ctx, args.userId);
  },
});

export const updateUserMemoryInternal = internalMutation({
  args: {
    userId: v.id("users"),
    memory: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const memory = args.memory.trim();
    if (memory.length === 0) {
      return { success: false, reason: "empty_memory" };
    }

    if (memory.length > MAX_USER_MEMORY_LENGTH) {
      return { success: false, reason: "memory_too_long" };
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("assistantUserMemory")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { memory, updatedAt: now });
    } else {
      await ctx.db.insert("assistantUserMemory", {
        userId: args.userId,
        memory,
        updatedAt: now,
      });
    }

    return { success: true };
  },
});
