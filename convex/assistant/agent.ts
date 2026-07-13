import { Agent, createTool, stepCountIs } from "@convex-dev/agent";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { resolveAssistantUserId } from "./auth";
import type {
  billingPortalResultValidator,
  conversationTitleUpdateResultValidator,
  courseSearchResultValidator,
  subscriptionToolResultValidator,
} from "./validators";
import type { Infer } from "convex/values";

type CourseSearchResult = Infer<typeof courseSearchResultValidator>;
type SubscriptionToolResult = Infer<typeof subscriptionToolResultValidator>;
type BillingPortalResult = Infer<typeof billingPortalResultValidator>;
type ConversationTitleUpdateResult = Infer<typeof conversationTitleUpdateResultValidator>;

const modelId = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

export const ASSISTANT_SYSTEM_INSTRUCTIONS = `You are the official AI assistant for Reham Diva.

Reham Diva helps women discover femininity courses, develop self-love,
and become the feminine women they deserve to be.

You help users:
- discover relevant courses
- understand which courses may suit their goals
- understand their current subscription
- open the secure subscription-management page

You support English and Arabic.

Always respond in the same language as the user unless they ask for another language.

When the user writes in Arabic, respond naturally in Arabic.
When the user writes in English, respond naturally in English.

Use tools for every factual claim about:
- available courses
- course titles
- course descriptions
- course URLs
- course access
- subscription status
- subscription renewal dates
- billing access

Never invent:
- courses
- course names
- course descriptions
- URLs
- prices
- subscription status
- renewal dates
- course availability
- plan access
- account information

When recommending courses:
- recommend only courses returned by the search tool
- explain briefly why each course is relevant in at most 2 short sentences
- prefer a few strong matches over a long list
- use the course information in the user's language
- do not claim access unless the backend confirms it
- do not replace stored Arabic or English course content with an invented translation
- do not repeat course titles, descriptions, URLs, bullet lists, or markdown in your reply when courses are returned—the app renders course cards automatically
- never use markdown headings or links for courses in your text response

If no relevant course is found, say so clearly and ask the user to describe their goal differently.

If the user asks about their subscription, always call getMySubscription first.
Only say the user must sign in when that tool returns authenticated: false.
If authenticated is true but status is "none", explain that they do not currently have an active subscription.
When subscription data is returned, keep your reply brief—the app renders a subscription card automatically.
Do not repeat plan names, dates, or status details in markdown lists when the card is shown.

For billing changes, direct the user to the secure subscription-management page.

Never ask for:
- card numbers
- CVV codes
- passwords
- one-time codes
- access tokens
- private authentication details

Do not perform:
- subscription cancellation
- upgrades
- downgrades
- refunds
- payment-method updates
- destructive account actions

Those actions are outside the scope of this first release.

Conversation titles:
- While the conversation title is still "New conversation" and within the first 8 user messages, call updateConversationTitle once you understand the topic.
- Prefer setting the title after the user's first message when the topic is clear.
- Use the user's language. Keep titles short (3-60 characters), descriptive, and free of markdown.
- Do not tell the user that you updated the title.
- The app may also auto-title early conversations, but you should still set a good title when possible.`;

export const rehamDivaAgent = new Agent(components.agent, {
  name: "Reham Diva Assistant",
  languageModel: openai.chat(modelId),
  instructions: ASSISTANT_SYSTEM_INSTRUCTIONS,
  stopWhen: stepCountIs(6),
  tools: {
    searchCourses: createTool({
      description:
        "Search published Reham Diva courses by topic, goal, or keywords. Returns localized course data.",
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
  },
});
