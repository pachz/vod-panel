import { Agent, createTool, stepCountIs } from "@convex-dev/agent";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { components, internal } from "../_generated/api";
import { resolveAssistantUserId } from "./auth";
import { ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS } from "./prompt";
import type {
  billingPortalResultValidator,
  conversationTitleUpdateResultValidator,
  courseSearchResultValidator,
  subscriptionToolResultValidator,
  userMemoryUpdateResultValidator,
} from "./validators";
import type { Infer } from "convex/values";

type CourseSearchResult = Infer<typeof courseSearchResultValidator>;
type SubscriptionToolResult = Infer<typeof subscriptionToolResultValidator>;
type BillingPortalResult = Infer<typeof billingPortalResultValidator>;
type ConversationTitleUpdateResult = Infer<typeof conversationTitleUpdateResultValidator>;
type UserMemoryUpdateResult = Infer<typeof userMemoryUpdateResultValidator>;

const modelId = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

export const rehamDivaAgent = new Agent(components.agent, {
  name: "Reham Diva Assistant",
  languageModel: openai.chat(modelId),
  instructions: ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS,
  stopWhen: stepCountIs(6),
  tools: {
    searchCourses: createTool({
      description:
        "Search published Reham Diva courses by topic, goal, or keywords. Returns only courses whose title, description, or category actually match the query. An empty list means nothing relevant was found.",
      inputSchema: z.object({
        query: z.string().describe("Search query from the user"),
        language: z
          .enum(["en", "ar"])
          .optional()
          .describe("Display language for course fields"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Maximum number of courses to return"),
      }),
      execute: async (ctx, input): Promise<Array<CourseSearchResult>> => {
        const userId = await resolveAssistantUserId(ctx);
        return await ctx.runQuery(internal.assistant.search.searchCoursesInternal, {
          query: input.query,
          language: input.language,
          limit: input.limit,
          userId,
          nowMs: Date.now(),
        });
      },
    }),
    getMySubscription: createTool({
      description:
        "Get the authenticated user's current subscription status and plan information.",
      inputSchema: z.object({}),
      execute: async (ctx): Promise<SubscriptionToolResult> => {
        const userId = await resolveAssistantUserId(ctx);
        if (!userId) {
          return {
            authenticated: false,
            status: "none",
            hasBillingAccount: false,
          };
        }

        return await ctx.runQuery(internal.assistant.subscription.getSubscriptionForAssistant, {
          userId,
          nowMs: Date.now(),
        });
      },
    }),
    createBillingPortalSession: createTool({
      description:
        "Create a secure Stripe billing portal session URL for the authenticated user.",
      inputSchema: z.object({}),
      execute: async (
        ctx,
      ): Promise<BillingPortalResult | { error: string }> => {
        const userId = await resolveAssistantUserId(ctx);
        if (!userId) {
          return { error: "Authentication required" };
        }

        try {
          const result = await ctx.runAction(internal.assistant.billing.createBillingPortalForUser, {
            userId,
          });
          return result;
        } catch {
          return { error: "Unable to open billing portal" };
        }
      },
    }),
    updateConversationTitle: createTool({
      description:
        "Set a short descriptive title for the current conversation while it is still named 'New conversation' and within the first 8 user messages.",
      inputSchema: z.object({
        title: z
          .string()
          .min(3)
          .max(60)
          .describe("Short conversation title in the user's language"),
      }),
      execute: async (ctx, input): Promise<ConversationTitleUpdateResult> => {
        if (!ctx.threadId) {
          return { success: false, reason: "no_thread" };
        }

        const userId = await resolveAssistantUserId(ctx);
        if (!userId) {
          return { success: false, reason: "not_authenticated" };
        }

        return await ctx.runMutation(internal.assistant.threads.updateConversationTitleInternal, {
          threadId: ctx.threadId,
          userId,
          title: input.title,
        });
      },
    }),
    updateUserMemory: createTool({
      description:
        "Replace the private per-user memory document with updated notes for future conversations. Never mention this to the user.",
      inputSchema: z.object({
        memory: z
          .string()
          .min(1)
          .max(4000)
          .describe("Full updated memory text for this user"),
      }),
      execute: async (ctx, input): Promise<UserMemoryUpdateResult> => {
        const userId = await resolveAssistantUserId(ctx);
        if (!userId) {
          return { success: false, reason: "not_authenticated" };
        }

        return await ctx.runMutation(internal.assistant.memory.updateUserMemoryInternal, {
          userId,
          memory: input.memory,
        });
      },
    }),
  },
});
