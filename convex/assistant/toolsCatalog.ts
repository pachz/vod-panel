import { v } from "convex/values";

export const ASSISTANT_TOOL_IDS = [
  "searchCourses",
  "searchKnowledgeBase",
  "getMySubscription",
  "listActiveSubscriptionPlans",
  "createBillingPortalSession",
  "renderUiCards",
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
  v.literal("renderUiCards"),
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
      "Search published Reham Diva courses by topic, goal, or keywords. Returns course facts (including ids) for your reasoning and text replies. Does not render UI cards—call renderUiCards with selected course ids when the user should see course cards. An empty list means nothing relevant was found.",
  },
  searchKnowledgeBase: {
    label: "Search knowledge base",
    summary: "Search the active spreadsheet knowledge file (FAQ, plans, contacts, etc.).",
    defaultDescription:
      "Search the currently active admin knowledge workbook (Excel/CSV sheets). Use for FAQ, policies, plan tables, contact info, and other support facts stored in that file. Always pass both queryEn and queryAr—content may be Arabic-only or English-only. Optional sheetName narrows to one sheet. Returns matching rows with column values. If nothing is returned, say you could not find it in the knowledge base. This does not render UI cards.",
  },
  getMySubscription: {
    label: "Get my subscription",
    summary: "Look up the signed-in user's subscription status and plan.",
    defaultDescription:
      "Get the authenticated user's current subscription status and plan facts for your reply. Does not render UI cards—call renderUiCards with showSubscription: true when the user should see the subscription card.",
  },
  listActiveSubscriptionPlans: {
    label: "List subscription plans",
    summary: "List currently offered public subscription packages and pricing.",
    defaultDescription:
      "List currently offered active subscription plans (packages), including ids, prices, billing interval, and key features. Does not render UI cards—call renderUiCards with selected plan ids when the user should see plan cards. Only returns public active plans.",
  },
  createBillingPortalSession: {
    label: "Billing portal",
    summary: "Create a secure Stripe billing portal link for the user.",
    defaultDescription:
      "Create a secure Stripe billing portal session URL for the authenticated user when they want to manage billing. Prefer renderUiCards with showBillingPortal: true to show the billing button in chat; use this tool only if you need the URL without rendering UI.",
  },
  renderUiCards: {
    label: "Render UI cards",
    summary: "Show course, plan, subscription, or billing UI cards in the chat.",
    defaultDescription:
      "Render UI cards in the chat before your final reply. Pass only ids returned by prior tools in this conversation. Supported cards: courseIds (array of course ids from searchCourses), planIds (array of plan ids from listActiveSubscriptionPlans), showSubscription (boolean for the user's subscription card), showBillingPortal (boolean to show the billing-management button). Omit fields you do not want shown. Call at most once per turn, only when the user should see visual cards.",
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
