import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { rehamDivaAgent } from "./agent";

export const streamAssistantResponse = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await rehamDivaAgent.streamText(
      ctx,
      { threadId: args.threadId, userId: args.userId },
      { promptMessageId: args.promptMessageId },
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
