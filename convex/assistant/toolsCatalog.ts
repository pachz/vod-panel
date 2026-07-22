import { v } from "convex/values";

export const ASSISTANT_TOOL_IDS = [
  "searchCourses",
  "searchKnowledgeBase",
  "getMySubscription",
  "listActiveSubscriptionPlans",
  "createBillingPortalSession",
  "updateConversationTitle",
  "updateUserMemory",
] as const;

export type AssistantToolId = (typeof ASSISTANT_TOOL_IDS)[number];

export const assistantToolIdValidator = v.union(
  v.literal("searchCourses"),
  v.literal("searchKnowledgeBase"),
  v.literal("getMySubscription"),
  v.literal("listActiveSubscriptionPlans"),
  v.literal("createBillingPortalSession"),
  v.literal("updateConversationTitle"),
  v.literal("updateUserMemory"),
);

export const assistantToolOverrideValidator = v.object({
  enabled: v.boolean(),
  descriptionAddon: v.string(),
});

export type AssistantToolOverride = {
  enabled: boolean;
  descriptionAddon: string;
};

export type AssistantToolOverrides = Partial<Record<AssistantToolId, AssistantToolOverride>>;

export const ASSISTANT_TOOL_CATALOG: Record<
  AssistantToolId,
  {
    label: string;
    summary: string;
    defaultDescription: string;
  }
> = {
  searchCourses: {
    label: "Search courses",
    summary: "Find published courses by topic, goal, or keywords.",
    defaultDescription:
      "Search published Reham Diva courses by topic, goal, or keywords. Returns only courses whose title, description, or category actually match the query. An empty list means nothing relevant was found.",
  },
  searchKnowledgeBase: {
    label: "Search knowledge base",
    summary: "Search the active spreadsheet knowledge file (FAQ, plans, contacts, etc.).",
    defaultDescription:
      "Search the currently active admin knowledge workbook (Excel/CSV sheets). Use for FAQ, policies, plan tables, contact info, and other support facts stored in that file. Always pass both queryEn and queryAr—content may be Arabic-only or English-only. Optional sheetName narrows to one sheet. Returns matching rows with column values. If nothing is returned, say you could not find it in the knowledge base.",
  },
  getMySubscription: {
    label: "Get my subscription",
    summary: "Look up the signed-in user's subscription status and plan.",
    defaultDescription:
      "Get the authenticated user's current subscription status and plan information.",
  },
  listActiveSubscriptionPlans: {
    label: "List subscription plans",
    summary: "List currently offered public subscription packages and pricing.",
    defaultDescription:
      "List currently offered active subscription plans (packages), including prices, billing interval, and key features. Use when the user asks what plans are available, about pricing, or how packages compare. Only returns public active plans.",
  },
  createBillingPortalSession: {
    label: "Billing portal",
    summary: "Create a secure Stripe billing portal link for the user.",
    defaultDescription:
      "Create a secure Stripe billing portal session URL for the authenticated user.",
  },
  updateConversationTitle: {
    label: "Update conversation title",
    summary: "Rename the chat while it is still a new conversation.",
    defaultDescription:
      "Set a short descriptive title for the current conversation while it is still named 'New conversation' and within the first 8 user messages.",
  },
  updateUserMemory: {
    label: "Update user memory",
    summary: "Store private per-user notes for future conversations.",
    defaultDescription:
      "Replace the private per-user memory document with updated notes for future conversations. Never mention this to the user.",
  },
};

export function isAssistantToolId(value: string): value is AssistantToolId {
  return (ASSISTANT_TOOL_IDS as ReadonlyArray<string>).includes(value);
}

export function resolveToolDescription(
  toolId: AssistantToolId,
  override?: AssistantToolOverride,
  runtimeDescription?: string,
): string {
  const base = runtimeDescription?.trim() || ASSISTANT_TOOL_CATALOG[toolId].defaultDescription;
  const addon = override?.descriptionAddon?.trim();
  if (!addon) {
    return base;
  }
  return `${base}\n\nAdditional guidance:\n${addon}`;
}

export function isToolEnabled(
  toolId: AssistantToolId,
  overrides?: AssistantToolOverrides | null,
): boolean {
  return overrides?.[toolId]?.enabled !== false;
}
