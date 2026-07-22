import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { requireAssistantTechAccess } from "./lib";

const conversationUserValidator = v.object({
  userId: v.string(),
  name: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
});

const conversationThreadValidator = v.object({
  _id: v.string(),
  _creationTime: v.number(),
  title: v.optional(v.string()),
  summary: v.optional(v.string()),
  status: v.union(v.literal("active"), v.literal("archived")),
  userId: v.optional(v.string()),
  latestMessage: v.optional(v.string()),
  lastMessageAt: v.optional(v.number()),
});

export const listUsersWithConversations = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(conversationUserValidator),
  handler: async (ctx, args) => {
    await requireAssistantTechAccess(ctx);

    const result = await ctx.runQuery(components.agent.users.listUsersWithThreads, {
      paginationOpts: args.paginationOpts,
    });

    const page = await Promise.all(
      result.page.map(async (userId) => {
        const user = await ctx.db.get(userId as Id<"users">);
        return {
          userId,
          name: user?.name ?? null,
          email: user?.email ?? null,
        };
      }),
    );

    return {
      ...result,
      page,
    };
  },
});

export const listConversationsForUser = query({
  args: {
    userId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(conversationThreadValidator),
  handler: async (ctx, args) => {
    await requireAssistantTechAccess(ctx);

    const results = await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
      userId: args.userId,
      paginationOpts: args.paginationOpts,
      order: "desc",
    });

    const page = await Promise.all(
      results.page.map(async (thread) => {
        const {
          page: [last],
        } = await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
          threadId: thread._id,
          order: "desc",
          paginationOpts: { numItems: 1, cursor: null },
        });

        return {
          _id: thread._id,
          _creationTime: thread._creationTime,
          title: thread.title,
          summary: thread.summary,
          status: thread.status,
          userId: thread.userId,
          latestMessage: last?.text,
          lastMessageAt: last?._creationTime,
        };
      }),
    );

    return {
      ...results,
      page,
    };
  },
});
