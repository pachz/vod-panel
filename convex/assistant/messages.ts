import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { authorizeThreadAccess } from "./lib";
import { ensureThreadHasUserId } from "./auth";
import { assistantLanguageValidator } from "./validators";

export const sendMessage = mutation({
  args: {
    threadId: v.string(),
    prompt: v.string(),
    language: v.optional(assistantLanguageValidator),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await authorizeThreadAccess(ctx, args.threadId);
    await ensureThreadHasUserId(ctx, args.threadId, userId);

    const trimmed = args.prompt.trim();
    if (trimmed.length === 0) {
      throw new Error("Message cannot be empty");
    }

    if (args.language) {
      await ctx.runMutation(components.agent.threads.updateThread, {
        threadId: args.threadId,
        patch: { summary: `lang:${args.language}` },
      });
    }

    // TODO: Apply rate limiting to assistant message submission when a rate limiter is available.

    const messageId: string = await ctx.runMutation(internal.assistant.threads.saveUserMessage, {
      threadId: args.threadId,
      prompt: trimmed,
    });

    await ctx.scheduler.runAfter(0, internal.assistant.chat.streamAssistantResponse, {
      threadId: args.threadId,
      promptMessageId: messageId,
      userId,
      language: args.language,
    });

    return messageId;
  },
});
