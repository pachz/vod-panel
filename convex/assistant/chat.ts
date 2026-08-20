"use node";

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type { ModelMessage } from "ai";
import { z } from "zod";
import type { MessageDoc } from "@convex-dev/agent";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { buildAssistantTools, rehamDivaAgent } from "./agent";
import type { AssistantToolOverrides } from "./toolsCatalog";
import { assistantLanguageValidator } from "./validators";
import {
  buildCleanupCtaPrompt,
  buildCleanupStreamPrompt,
  collectToolOnlyModelMessages,
  collectToolResultsFromMessages,
  collectToolResultsFromSteps,
  emptyCleanupDecisions,
  extractCtaInventory,
  mergeCtaInventories,
  patchToolResultMessages,
  sanitizeCleanupDecisions,
  type CleanupDecisions,
  type CleanupRuntimeSettings,
} from "./cleanup";

const cleanupDecisionsSchema = z.object({
  keepCallToActionUrls: z.array(z.string()),
  keepCoursesCatalog: z.boolean(),
  keepWhatsAppSupport: z.boolean(),
});

async function decideCtaCleanup(
  draftText: string,
  inventory: ReturnType<typeof extractCtaInventory>,
  cleanup: CleanupRuntimeSettings,
): Promise<CleanupDecisions> {
  // Nothing for the CTA LLM to decide — dedicated tools are always kept.
  if (inventory.callToActions.length === 0) {
    return emptyCleanupDecisions(inventory);
  }

  const { object } = await generateObject({
    model: openai.chat(cleanup.model),
    schema: cleanupDecisionsSchema,
    system: cleanup.ctaSystemPrompt,
    prompt: buildCleanupCtaPrompt(draftText, inventory, cleanup.ctaUserPromptTemplate),
    temperature: cleanup.ctaTemperature,
  });

  return sanitizeCleanupDecisions(object, inventory);
}

async function restoreDraftText(
  ctx: Parameters<typeof rehamDivaAgent.saveMessage>[0],
  args: { threadId: string; userId: string; promptMessageId: string; draftText: string },
): Promise<void> {
  if (!args.draftText.trim()) return;
  await rehamDivaAgent.saveMessage(ctx, {
    threadId: args.threadId,
    userId: args.userId,
    promptMessageId: args.promptMessageId,
    message: {
      role: "assistant",
      content: args.draftText,
    },
  });
}

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
    const [system, toolOverrides, knowledgeContext, namedInstructionsContext, cleanup] =
      await Promise.all([
        ctx.runQuery(internal.assistant.promptRuntime.getSystemInstructions, {
          userId: args.userId,
          nowMs,
          language: args.language,
        }),
        ctx.runQuery(internal.assistant.settings.getToolOverridesInternal, {}),
        ctx.runQuery(
          internal.assistant.knowledgeFiles.getActiveKnowledgeToolContextInternal,
          {},
        ),
        ctx.runQuery(
          internal.assistant.namedInstructions.getNamedInstructionsToolContextInternal,
          {},
        ),
        ctx.runQuery(internal.assistant.settings.getCleanupSettingsInternal, {}),
      ]);

    const tools = buildAssistantTools(
      toolOverrides as AssistantToolOverrides,
      knowledgeContext,
      namedInstructionsContext,
    );

    // Pass 1: full agent with tools. Do NOT persist messages — otherwise the draft
    // prose is written to the thread and reactive clients see it before cleanup.
    const pass1 = await rehamDivaAgent.generateText(
      ctx,
      { threadId: args.threadId, userId: args.userId },
      { promptMessageId: args.promptMessageId, system, tools },
      { storageOptions: { saveMessages: "none" } },
    );

    const draftText = pass1.text?.trim() ?? "";
    const toolOnlyMessages = collectToolOnlyModelMessages(
      pass1.response?.messages,
      pass1.steps,
    ) as ModelMessage[];
    const inventory = mergeCtaInventories(
      extractCtaInventory(collectToolResultsFromSteps(pass1.steps ?? [])),
      extractCtaInventory(collectToolResultsFromMessages(pass1.response?.messages)),
      extractCtaInventory(collectToolResultsFromMessages(toolOnlyMessages)),
    );

    let savedToolMessages: MessageDoc[] = [];
    if (toolOnlyMessages.length > 0) {
      const saved = await rehamDivaAgent.saveMessages(ctx, {
        threadId: args.threadId,
        userId: args.userId,
        promptMessageId: args.promptMessageId,
        messages: toolOnlyMessages,
        skipEmbeddings: true,
      });
      savedToolMessages = saved.messages;
    }

    let decisions = emptyCleanupDecisions(inventory);
    let cleanupOk = false;

    try {
      decisions = await decideCtaCleanup(draftText, inventory, cleanup);
      console.log("[assistant:cleanup] CTA decisions", {
        inventory,
        decisions,
      });

      const patches = patchToolResultMessages(savedToolMessages, decisions);
      for (const patch of patches) {
        if (!patch.message) continue;
        await rehamDivaAgent.updateMessage(ctx, {
          messageId: patch.messageId,
          patch: {
            message: patch.message,
            status: "success",
          },
        });
      }

      cleanupOk = true;
    } catch (error) {
      console.error("[assistant:cleanup] CTA cleanup failed", error);
    }

    try {
      if (cleanupOk && draftText.length > 0) {
        // Pass 2b: stream only the cleaned reply to the client.
        const cleanedStream = await rehamDivaAgent.streamText(
          ctx,
          { threadId: args.threadId, userId: args.userId },
          {
            promptMessageId: args.promptMessageId,
            model: openai.chat(cleanup.model),
            system: cleanup.streamSystemPrompt,
            prompt: buildCleanupStreamPrompt(draftText, cleanup.streamUserPromptTemplate),
          },
          {
            saveStreamDeltas: { chunking: "word", throttleMs: 100 },
            contextOptions: { recentMessages: 0, excludeToolMessages: true },
            storageOptions: { saveMessages: "promptAndOutput" },
          },
        );
        await cleanedStream.consumeStream();
      } else if (!cleanupOk && draftText.length > 0) {
        // Cleanup failed — fall back to original draft text (never streamed as Pass 1).
        await restoreDraftText(ctx, {
          threadId: args.threadId,
          userId: args.userId,
          promptMessageId: args.promptMessageId,
          draftText,
        });
      } else if (draftText.length === 0) {
        // Tools/cards-only (or empty) turn: settle so the UI stops waiting for prose.
        await rehamDivaAgent.saveMessage(ctx, {
          threadId: args.threadId,
          userId: args.userId,
          promptMessageId: args.promptMessageId,
          message: {
            role: "assistant",
            // Invisible marker so clients treat the turn as complete without visible prose.
            content: "\u200c",
          },
          skipEmbeddings: true,
        });
      }
    } catch (error) {
      console.error("[assistant:cleanup] stream rewrite failed; restoring draft", error);
      if (draftText.length > 0) {
        try {
          await restoreDraftText(ctx, {
            threadId: args.threadId,
            userId: args.userId,
            promptMessageId: args.promptMessageId,
            draftText,
          });
        } catch (restoreError) {
          console.error("[assistant:cleanup] failed to restore draft text", restoreError);
        }
      }
    }

    await ctx.scheduler.runAfter(0, internal.assistant.titles.maybeAutoTitleThread, {
      threadId: args.threadId,
      userId: args.userId,
    });

    return null;
  },
});
