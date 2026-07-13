"use node";

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import {
  DEFAULT_THREAD_TITLE,
  EARLY_CONVERSATION_USER_MESSAGE_LIMIT,
  sanitizeConversationTitle,
  titleFromUserMessage,
} from "./auth";

const modelId = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

async function getEarlyUserMessages(
  ctx: ActionCtx,
  threadId: string,
): Promise<Array<string>> {
  const result = await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
    threadId,
    order: "asc",
    excludeToolMessages: true,
    paginationOpts: {
      cursor: null,
      numItems: EARLY_CONVERSATION_USER_MESSAGE_LIMIT * 2,
    },
  });

  return result.page
    .filter((message) => message.message?.role === "user")
    .map((message) => (message.text ?? "").trim())
    .filter((text) => text.length > 0)
    .slice(0, EARLY_CONVERSATION_USER_MESSAGE_LIMIT);
}

export const maybeAutoTitleThread = internalAction({
  args: {
    threadId: v.string(),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.runQuery(components.agent.threads.getThread, {
      threadId: args.threadId,
    });
    if (!thread) {
      return null;
    }

    const currentTitle = thread.title?.trim();
    if (currentTitle && currentTitle !== DEFAULT_THREAD_TITLE) {
      return null;
    }

    const userMessages = await getEarlyUserMessages(ctx, args.threadId);
    if (
      userMessages.length === 0 ||
      userMessages.length > EARLY_CONVERSATION_USER_MESSAGE_LIMIT
    ) {
      return null;
    }

    let title = titleFromUserMessage(userMessages[0]!);

    const shouldSummarizeWithModel =
      !title ||
      userMessages[0]!.length > 48 ||
      userMessages.length > 1 ||
      userMessages[0]!.includes("?");

    if (shouldSummarizeWithModel) {
      try {
        const { text } = await generateText({
          model: openai(modelId),
          prompt: [
            "Write a short conversation title for a support chat.",
            "Rules: 3-8 words, max 60 characters, no quotes, no markdown, same language as the user.",
            "Return only the title.",
            "",
            "User messages:",
            ...userMessages.map((message, index) => `${index + 1}. ${message}`),
          ].join("\n"),
          maxOutputTokens: 32,
        });
        title = sanitizeConversationTitle(text.trim()) ?? title;
      } catch (error) {
        console.error("Failed to generate conversation title:", error);
      }
    }

    if (!title) {
      return null;
    }

    const result = await ctx.runMutation(
      internal.assistant.threads.updateConversationTitleInternal,
      {
        threadId: args.threadId,
        userId: args.userId,
        title,
      },
    );

    if (!result.success) {
      console.warn("Auto conversation title skipped:", result.reason);
    }

    return null;
  },
});
