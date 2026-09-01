import { v } from "convex/values";

export const ASSISTANT_TOOL_IDS = [
  "searchCourses",
  "searchKnowledgeBase",
  "getNamedInstructions",
  "getMySubscription",
  "listActiveSubscriptionPlans",
  "createBillingPortalSession",
  "renderUiCards",
  "showCoursesCatalog",
  "sendWhatsAppSupport",
  "updateConversationTitle",
  "updateUserMemory",
] as const;

export type AssistantToolId = (typeof ASSISTANT_TOOL_IDS)[number];

/** Tools available to anonymous website visitors. Account/billing/memory stay members-only. */
export const PUBLIC_ASSISTANT_TOOL_IDS = [
  "searchCourses",
  "searchKnowledgeBase",
  "getNamedInstructions",
  "listActiveSubscriptionPlans",
  "renderUiCards",
  "showCoursesCatalog",
  "sendWhatsAppSupport",
  "updateConversationTitle",
] as const;

export type PublicAssistantToolId = (typeof PUBLIC_ASSISTANT_TOOL_IDS)[number];

export const MEMBER_ONLY_ASSISTANT_TOOL_IDS = [
  "getMySubscription",
  "createBillingPortalSession",
  "updateUserMemory",
] as const;

export const assistantToolIdValidator = v.union(
  v.literal("searchCourses"),
  v.literal("searchKnowledgeBase"),
  v.literal("getNamedInstructions"),
  v.literal("getMySubscription"),
  v.literal("listActiveSubscriptionPlans"),
  v.literal("createBillingPortalSession"),
  v.literal("renderUiCards"),
  v.literal("showCoursesCatalog"),
  v.literal("sendWhatsAppSupport"),
  v.literal("updateConversationTitle"),
  v.literal("updateUserMemory"),
);

/** Default catalog CTA copy. Admins may override messageEn / messageAr in settings. */
export const COURSES_CATALOG_DEFAULTS = {
  messageEn:
    "For a complete list of courses, you can explore more in our courses catalog.",
  messageAr:
    "للحصول على قائمة كاملة بالدورات، يمكنك استكشاف المزيد في كتالوج الدورات لدينا.",
  buttonTextEn: "All courses",
  buttonTextAr: "جميع الدورات",
  urlEn: "https://www.rehamdiva.com/en/courses",
  urlAr: "https://www.rehamdiva.com/ar/courses",
} as const;

/** Default WhatsApp support CTA copy. Admins may override messageEn / messageAr in settings. */
export const WHATSAPP_SUPPORT_DEFAULTS = {
  messageEn: "To reach our support team, you can message us on WhatsApp.",
  messageAr: "للتواصل مع فريق الدعم، يمكنك مراسلتنا عبر واتساب.",
  buttonTextEn: "Message on WhatsApp",
  buttonTextAr: "مراسلة عبر واتساب",
  url: "https://wa.me/96550406406",
} as const;

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
      "Search published Reham Diva courses by topic, goal, or keywords. Returns course facts (including ids) for your reasoning and text replies. Does not render UI cards—call renderUiCards with selected course ids when the user should see course cards. An empty list means nothing relevant was found. Pass language \"ar\" when answering in Arabic so titles and descriptions are Arabic.",
  },
  searchKnowledgeBase: {
    label: "Search knowledge base",
    summary: "Search the active spreadsheet knowledge file (FAQ, plans, contacts, etc.).",
    defaultDescription:
      "Search the currently active admin knowledge workbook (Excel/CSV sheets). Use for FAQ, policies, plan tables, contact info, and other support facts stored in that file. Always pass both queryEn and queryAr—content may be Arabic-only or English-only. Optional sheetName narrows to one sheet. Returns matching rows with column values. If nothing is returned, say you could not find it in the knowledge base. This does not render UI cards.",
  },
  getNamedInstructions: {
    label: "Get named instructions",
    summary: "Load admin-defined instruction packs by name for specialized guidance.",
    defaultDescription:
      "Fetch detailed admin-defined instruction packs by name. Use when the conversation matches a pack's when-to-use guidance, or when you need specialized process/policy/tone rules that are not in the main system prompt. Pass one or more exact names from the available list. Follow returned instructions for the rest of the turn. This does not render UI cards and does not replace searchKnowledgeBase for factual FAQ lookup.",
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
    summary: "Show course, plan, subscription, billing, or CTA buttons in the chat.",
    defaultDescription:
      "Render UI cards in the chat before your final reply. Pass only ids returned by prior tools in this conversation. Supported cards: courseIds (array of course ids from searchCourses), planIds (array of plan ids from listActiveSubscriptionPlans), showSubscription (boolean for the user's subscription card), showBillingPortal (boolean to show the billing-management button), callToActions (array of { text, url } for large call-to-action buttons—use https URLs or site paths starting with /). Pass language \"ar\" when your reply is in Arabic so course cards use Arabic titles and descriptions. Do not put URLs or markdown links in your text reply—use callToActions or other CTA tools instead. Omit fields you do not want shown. Call at most once per turn, only when the user should see visual cards or CTA buttons.",
  },
  showCoursesCatalog: {
    label: "Show courses catalog",
    summary: "Append a fixed catalog message and an All courses button after your reply.",
    defaultDescription:
      "Show a fixed courses-catalog message line and an All courses button after your text reply. Use when the user wants to browse the full courses list/catalog, or when inviting them to explore more courses beyond specific recommendations. Input: none. Do not write the catalog message line or the button label yourself—the UI appends them from this tool. Call at most once per turn. Prefer writing your reply, then calling this tool.",
  },
  sendWhatsAppSupport: {
    label: "Send WhatsApp support",
    summary: "Append a fixed support message and a WhatsApp button after your reply.",
    defaultDescription:
      "Show a fixed WhatsApp-support message line and a Message on WhatsApp button after your text reply. Use when the user needs human support, wants to contact the team, or you cannot fully resolve their issue. Optional input text: a short first-person WhatsApp prefill in the same language as the chat (omit if nothing useful). Do not write the support message line or the button label yourself—the UI appends them from this tool. Call at most once per turn. Prefer writing your reply, then calling this tool.",
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

export function isPublicAssistantToolId(value: string): value is PublicAssistantToolId {
  return (PUBLIC_ASSISTANT_TOOL_IDS as ReadonlyArray<string>).includes(value);
}

export const PUBLIC_RENDER_UI_CARDS_DESCRIPTION =
  "Render UI cards in the chat before your final reply. Pass only ids returned by prior tools in this conversation. Supported cards: courseIds (array of course ids from searchCourses), planIds (array of plan ids from listActiveSubscriptionPlans), callToActions (array of { text, url } for large call-to-action buttons—use https URLs or site paths starting with /). Pass language \"ar\" when your reply is in Arabic so course cards use Arabic titles and descriptions. Do not put URLs or markdown links in your text reply—use callToActions or other CTA tools instead. Omit fields you do not want shown. Never use showSubscription or showBillingPortal—this visitor is not signed in. Call at most once per turn, only when the visitor should see visual cards or CTA buttons.";

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
