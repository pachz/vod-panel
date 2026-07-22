import {
  createThread,
  getThreadMetadata,
  listUIMessages,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { internalMutation, mutation, query } from "../_generated/server";
import {
  authorizeThreadAccess,
  authorizeThreadReadAccess,
  requireAssistantAccess,
} from "./lib";
import { assistantLanguageValidator, conversationTitleUpdateResultValidator } from "./validators";
import { rehamDivaAgent } from "./agent";
import {
  assertThreadOwnedByUser,
  countUserThreadMessages,
  DEFAULT_THREAD_TITLE,
  EARLY_CONVERSATION_USER_MESSAGE_LIMIT,
  sanitizeConversationTitle,
} from "./auth";

export const listThreads = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = await requireAssistantAccess(ctx);

    return await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
      userId,
      paginationOpts: args.paginationOpts,
    });
  },
});

export const createAssistantThread = mutation({
  args: {
    language: v.optional(assistantLanguageValidator),
    title: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await requireAssistantAccess(ctx);

    const threadId = await createThread(ctx, components.agent, {
      userId,
      title: args.title ?? "New conversation",
      summary: args.language ? `lang:${args.language}` : undefined,
    });

    return threadId;
  },
});

export const getThreadLanguage = query({
  args: {
    threadId: v.string(),
  },
  returns: v.union(assistantLanguageValidator, v.null()),
  handler: async (ctx, args) => {
    await authorizeThreadReadAccess(ctx, args.threadId);
    const metadata = await getThreadMetadata(ctx, components.agent, {
      threadId: args.threadId,
    });
    const summary = metadata.summary;
    if (summary?.startsWith("lang:")) {
      const lang = summary.slice("lang:".length);
      if (lang === "en" || lang === "ar") {
        return lang;
      }
    }
    return null;
  },
});

export const listThreadMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await authorizeThreadReadAccess(ctx, args.threadId);
    const paginated = await listUIMessages(ctx, components.agent, args);
    const streams = await syncStreams(ctx, components.agent, args);
    return { ...paginated, streams };
  },
});

export const saveUserMessage = internalMutation({
  args: {
    threadId: v.string(),
    prompt: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await authorizeThreadAccess(ctx, args.threadId);
    const { messageId } = await rehamDivaAgent.saveMessage(ctx, {
      threadId: args.threadId,
      userId,
      prompt: args.prompt,
      skipEmbeddings: true,
    });
    return messageId;
  },
});

export const updateConversationTitleInternal = internalMutation({
  args: {
    threadId: v.string(),
    userId: v.id("users"),
    title: v.string(),
  },
  returns: conversationTitleUpdateResultValidator,
  handler: async (ctx, args) => {
    try {
      await assertThreadOwnedByUser(ctx, args.threadId, args.userId);
    } catch {
      return { success: false, reason: "unauthorized" };
    }

    const messageCount = await countUserThreadMessages(ctx, args.threadId);
    if (messageCount > EARLY_CONVERSATION_USER_MESSAGE_LIMIT) {
      return { success: false, reason: "too_late" };
    }

    const thread = await ctx.runQuery(components.agent.threads.getThread, {
      threadId: args.threadId,
    });
    const currentTitle = thread?.title?.trim();
    if (currentTitle && currentTitle !== DEFAULT_THREAD_TITLE) {
      return { success: false, reason: "already_titled" };
    }

    const title = sanitizeConversationTitle(args.title);
    if (!title) {
      return { success: false, reason: "invalid_title" };
    }

    await ctx.runMutation(components.agent.threads.updateThread, {
      threadId: args.threadId,
      patch: { title },
    });

    return { success: true, title };
  },
});
