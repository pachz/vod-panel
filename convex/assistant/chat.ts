import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { buildAssistantTools, rehamDivaAgent } from "./agent";
import type { AssistantToolOverrides } from "./toolsCatalog";
import { assistantLanguageValidator } from "./validators";

export const streamAssistantResponse = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    userId: v.id("users"),
    language: v.optional(assistantLanguageValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const [system, toolOverrides, knowledgeContext] = await Promise.all([
      ctx.runQuery(internal.assistant.promptRuntime.getSystemInstructions, {
        userId: args.userId,
        nowMs,
        language: args.language,
      }),
      ctx.runQuery(internal.assistant.settings.getToolOverridesInternal, {}),
      ctx.runQuery(internal.assistant.knowledgeFiles.getActiveKnowledgeToolContextInternal, {}),
    ]);

    const tools = buildAssistantTools(
      toolOverrides as AssistantToolOverrides,
      knowledgeContext,
    );

    const result = await rehamDivaAgent.streamText(
      ctx,
      { threadId: args.threadId, userId: args.userId },
      { promptMessageId: args.promptMessageId, system, tools },
      { saveStreamDeltas: { chunking: "word", throttleMs: 100 } },
    );
    await result.consumeStream();

    await ctx.scheduler.runAfter(0, internal.assistant.titles.maybeAutoTitleThread, {
      threadId: args.threadId,
      userId: args.userId,
    });

    return null;
  },
});
