import { Agent, createTool, stepCountIs } from "@convex-dev/agent";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { components, internal } from "../_generated/api";
import { resolveAssistantUserId } from "./auth";
import {
  buildKnowledgeSearchToolDescription,
} from "./knowledgeFiles";
import {
  buildNamedInstructionsToolDescription,
  type NamedInstructionsToolContext,
} from "./namedInstructions";
import { ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS } from "./prompt";
import {
  ASSISTANT_TOOL_IDS,
  isToolEnabled,
  resolveToolDescription,
  type AssistantToolOverrides,
} from "./toolsCatalog";
import type {
  activeSubscriptionPlanValidator,
  billingPortalResultValidator,
  conversationTitleUpdateResultValidator,
  courseSearchResultValidator,
  namedInstructionResultValidator,
  renderUiCardsResultValidator,
  subscriptionToolResultValidator,
  userMemoryUpdateResultValidator,
} from "./validators";
import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";

type CourseSearchResult = Infer<typeof courseSearchResultValidator>;
type SubscriptionToolResult = Infer<typeof subscriptionToolResultValidator>;
type ActiveSubscriptionPlan = Infer<typeof activeSubscriptionPlanValidator>;
type BillingPortalResult = Infer<typeof billingPortalResultValidator>;
type RenderUiCardsResult = Infer<typeof renderUiCardsResultValidator>;
type ConversationTitleUpdateResult = Infer<typeof conversationTitleUpdateResultValidator>;
type UserMemoryUpdateResult = Infer<typeof userMemoryUpdateResultValidator>;
type NamedInstructionResult = Infer<typeof namedInstructionResultValidator>;

type KnowledgeSearchResult = {
  sheetId: Id<"assistantKnowledgeSheets">;
  sheetName: string;
  searchMode: "semantic" | "structured" | "hybrid";
  rowIndex: number;
  data: Array<{ header: string; value: string }>;
  searchableText: string;
  matchSource?: "text" | "vector" | "both";
  score?: number;
};

export type ActiveKnowledgeToolContext = {
  fileId: Id<"assistantKnowledgeFiles">;
  fileName: string;
  description: string;
  languages: string[];
  whenToUse: string;
  howToSearch: string;
  exampleQueries: string[];
  toolDescription: string;
  sheets: Array<{
    sheetId: Id<"assistantKnowledgeSheets">;
    name: string;
    headers: string[];
    purpose: string;
    searchMode: "semantic" | "structured" | "hybrid";
    languages: string[];
    keywords: string[];
    searchHints: string;
    rowCount: number;
  }>;
};

const modelId = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

function summarizeToolResult(result: unknown): unknown {
  if (Array.isArray(result)) {
    return {
      count: result.length,
      sample: result.slice(0, 3),
    };
  }
  if (result && typeof result === "object") {
    return result;
  }
  return result;
}

async function withToolCallLogging<T>(
  toolName: string,
  input: unknown,
  execute: () => Promise<T>,
): Promise<T> {
  console.log(`[assistant:tool] ${toolName} call`, input ?? {});
  try {
    const result = await execute();
    console.log(`[assistant:tool] ${toolName} result`, summarizeToolResult(result));
    return result;
  } catch (error) {
    console.error(`[assistant:tool] ${toolName} error`, error);
    throw error;
  }
}

function createSearchCoursesTool(description: string) {
  return createTool({
    description,
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
      return await withToolCallLogging("searchCourses", input, async () => {
        const userId = await resolveAssistantUserId(ctx);
        return await ctx.runQuery(internal.assistant.search.searchCoursesInternal, {
          query: input.query,
          language: input.language,
          limit: input.limit,
          userId,
          nowMs: Date.now(),
        });
      });
    },
  });
}

function createSearchKnowledgeBaseTool(description: string) {
  return createTool({
    description,
    inputSchema: z.object({
      queryEn: z
        .string()
        .describe(
          "English search keywords/phrases for the knowledge base. Always provide this, even if the user wrote in Arabic.",
        ),
      queryAr: z
        .string()
        .describe(
          "Arabic search keywords/phrases for the knowledge base. Always provide this, even if the user wrote in English. Translate the intent; do not transliterate English words.",
        ),
      sheetName: z
        .string()
        .optional()
        .describe("Optional exact sheet name to narrow the search"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Maximum number of matching rows to return"),
    }),
    execute: async (ctx, input): Promise<Array<KnowledgeSearchResult>> => {
      return await withToolCallLogging("searchKnowledgeBase", input, async () => {
        return await ctx.runAction(
          internal.assistant.knowledgeFileProcessing.searchKnowledgeBaseHybrid,
          {
            queries: [input.queryEn, input.queryAr],
            sheetName: input.sheetName,
            limit: input.limit,
          },
        );
      });
    },
  });
}

function createGetNamedInstructionsTool(description: string) {
  return createTool({
    description,
    inputSchema: z.object({
      names: z
        .array(z.string().min(1).max(80))
        .min(1)
        .max(10)
        .describe(
          "Exact instruction pack names to load (from the available list in this tool description)",
        ),
    }),
    execute: async (ctx, input): Promise<Array<NamedInstructionResult>> => {
      return await withToolCallLogging("getNamedInstructions", input, async () => {
        return await ctx.runQuery(
          internal.assistant.namedInstructions.getNamedInstructionsInternal,
          { names: input.names },
        );
      });
    },
  });
}

function createGetMySubscriptionTool(description: string) {
  return createTool({
    description,
    inputSchema: z.object({}),
    execute: async (ctx): Promise<SubscriptionToolResult> => {
      return await withToolCallLogging("getMySubscription", {}, async () => {
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
      });
    },
  });
}

function createListActiveSubscriptionPlansTool(description: string) {
  return createTool({
    description,
    inputSchema: z.object({}),
    execute: async (ctx): Promise<Array<ActiveSubscriptionPlan>> => {
      return await withToolCallLogging("listActiveSubscriptionPlans", {}, async () => {
        const userId = await resolveAssistantUserId(ctx);
        return await ctx.runQuery(
          internal.assistant.subscription.listActiveSubscriptionPlansInternal,
          {
            userId: userId ?? undefined,
            nowMs: Date.now(),
          },
        );
      });
    },
  });
}

function createBillingPortalSessionTool(description: string) {
  return createTool({
    description,
    inputSchema: z.object({}),
    execute: async (ctx): Promise<BillingPortalResult | { error: string }> => {
      return await withToolCallLogging("createBillingPortalSession", {}, async () => {
        const userId = await resolveAssistantUserId(ctx);
        if (!userId) {
          return { error: "Authentication required" };
        }

        try {
          const result = await ctx.runAction(
            internal.assistant.billing.createBillingPortalForUser,
            { userId },
          );
          return result;
        } catch {
          return { error: "Unable to open billing portal" };
        }
      });
    },
  });
}

function createRenderUiCardsTool(description: string) {
  return createTool({
    description,
    inputSchema: z.object({
      courseIds: z
        .array(z.string())
        .max(10)
        .optional()
        .describe("Course ids from searchCourses to show as course cards"),
      planIds: z
        .array(z.string())
        .max(10)
        .optional()
        .describe("Plan ids from listActiveSubscriptionPlans to show as plan cards"),
      showSubscription: z
        .boolean()
        .optional()
        .describe("true to show the user's subscription summary card"),
      showBillingPortal: z
        .boolean()
        .optional()
        .describe("true to show the billing-management button"),
      language: z
        .enum(["en", "ar"])
        .optional()
        .describe("Display language for course card fields"),
    }),
    execute: async (ctx, input): Promise<RenderUiCardsResult> => {
      return await withToolCallLogging("renderUiCards", input, async () => {
        const userId = await resolveAssistantUserId(ctx);
        const nowMs = Date.now();
        const language = input.language ?? "en";
        const courseIds = input.courseIds ?? [];
        const planIds = input.planIds ?? [];

        const courses =
          courseIds.length > 0
            ? await ctx.runQuery(internal.assistant.search.getCoursesByIdsForUiCardsInternal, {
                courseIds,
                language,
                userId,
                nowMs,
              })
            : [];

        const plans =
          planIds.length > 0
            ? await ctx.runQuery(
                internal.assistant.subscription.getPlansByIdsForUiCardsInternal,
                {
                  planIds,
                  userId: userId ?? undefined,
                  nowMs,
                },
              )
            : [];

        let subscription: SubscriptionToolResult | null = null;
        if (input.showSubscription) {
          if (!userId) {
            subscription = {
              authenticated: false,
              status: "none",
              hasBillingAccount: false,
            };
          } else {
            subscription = await ctx.runQuery(
              internal.assistant.subscription.getSubscriptionForAssistant,
              { userId, nowMs },
            );
          }
        }

        let billingPortalUrl: string | null = null;
        if (input.showBillingPortal) {
          if (userId) {
            try {
              const portal = await ctx.runAction(
                internal.assistant.billing.createBillingPortalForUser,
                { userId },
              );
              billingPortalUrl = portal.url;
            } catch {
              billingPortalUrl = null;
            }
          }
        }

        return {
          courses,
          plans,
          subscription,
          billingPortalUrl,
        };
      });
    },
  });
}

function createUpdateConversationTitleTool(description: string) {
  return createTool({
    description,
    inputSchema: z.object({
      title: z
        .string()
        .min(3)
        .max(60)
        .describe("Short conversation title in the user's language"),
    }),
    execute: async (ctx, input): Promise<ConversationTitleUpdateResult> => {
      return await withToolCallLogging("updateConversationTitle", input, async () => {
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
      });
    },
  });
}

function createUpdateUserMemoryTool(description: string) {
  return createTool({
    description,
    inputSchema: z.object({
      memory: z
        .string()
        .min(1)
        .max(4000)
        .describe("Full updated memory text for this user"),
    }),
    execute: async (ctx, input): Promise<UserMemoryUpdateResult> => {
      return await withToolCallLogging(
        "updateUserMemory",
        { memoryLength: input.memory.length },
        async () => {
          const userId = await resolveAssistantUserId(ctx);
          if (!userId) {
            return { success: false, reason: "not_authenticated" };
          }

          return await ctx.runMutation(internal.assistant.memory.updateUserMemoryInternal, {
            userId,
            memory: input.memory,
          });
        },
      );
    },
  });
}

/** Build the tool set for a turn, applying admin enable/description overrides. */
export function buildAssistantTools(
  overrides?: AssistantToolOverrides | null,
  knowledgeContext?: ActiveKnowledgeToolContext | null,
  namedInstructionsContext?: NamedInstructionsToolContext | null,
) {
  const tools: {
    searchCourses?: ReturnType<typeof createSearchCoursesTool>;
    searchKnowledgeBase?: ReturnType<typeof createSearchKnowledgeBaseTool>;
    getNamedInstructions?: ReturnType<typeof createGetNamedInstructionsTool>;
    getMySubscription?: ReturnType<typeof createGetMySubscriptionTool>;
    listActiveSubscriptionPlans?: ReturnType<typeof createListActiveSubscriptionPlansTool>;
    createBillingPortalSession?: ReturnType<typeof createBillingPortalSessionTool>;
    renderUiCards?: ReturnType<typeof createRenderUiCardsTool>;
    updateConversationTitle?: ReturnType<typeof createUpdateConversationTitleTool>;
    updateUserMemory?: ReturnType<typeof createUpdateUserMemoryTool>;
  } = {};

  for (const toolId of ASSISTANT_TOOL_IDS) {
    if (!isToolEnabled(toolId, overrides)) {
      continue;
    }

    // Only expose knowledge search when an active ready workbook exists.
    if (toolId === "searchKnowledgeBase" && !knowledgeContext) {
      continue;
    }

    // Only expose named instructions when at least one enabled pack exists.
    if (toolId === "getNamedInstructions" && !namedInstructionsContext) {
      continue;
    }

    let runtimeDescription: string | undefined;
    if (toolId === "searchKnowledgeBase" && knowledgeContext) {
      runtimeDescription = buildKnowledgeSearchToolDescription(
        knowledgeContext,
        overrides?.[toolId]?.descriptionAddon,
      );
    } else if (toolId === "getNamedInstructions" && namedInstructionsContext) {
      runtimeDescription = buildNamedInstructionsToolDescription(
        namedInstructionsContext,
        overrides?.[toolId]?.descriptionAddon,
      );
    }

    const description =
      runtimeDescription ??
      resolveToolDescription(toolId, overrides?.[toolId]);

    switch (toolId) {
      case "searchCourses":
        tools.searchCourses = createSearchCoursesTool(description);
        break;
      case "searchKnowledgeBase":
        tools.searchKnowledgeBase = createSearchKnowledgeBaseTool(description);
        break;
      case "getNamedInstructions":
        tools.getNamedInstructions = createGetNamedInstructionsTool(description);
        break;
      case "getMySubscription":
        tools.getMySubscription = createGetMySubscriptionTool(description);
        break;
      case "listActiveSubscriptionPlans":
        tools.listActiveSubscriptionPlans =
          createListActiveSubscriptionPlansTool(description);
        break;
      case "createBillingPortalSession":
        tools.createBillingPortalSession = createBillingPortalSessionTool(description);
        break;
      case "renderUiCards":
        tools.renderUiCards = createRenderUiCardsTool(description);
        break;
      case "updateConversationTitle":
        tools.updateConversationTitle = createUpdateConversationTitleTool(description);
        break;
      case "updateUserMemory":
        tools.updateUserMemory = createUpdateUserMemoryTool(description);
        break;
      default: {
        const _exhaustive: never = toolId;
        void _exhaustive;
        break;
      }
    }
  }

  return tools;
}

export const rehamDivaAgent = new Agent(components.agent, {
  name: "Reham Diva Assistant",
  languageModel: openai.chat(modelId),
  instructions: ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS,
  stopWhen: stepCountIs(8),
  tools: buildAssistantTools(),
});
