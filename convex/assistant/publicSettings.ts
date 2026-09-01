import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { requireUser } from "../utils/auth";
import {
  PUBLIC_ASSISTANT_GREETING_DEFAULTS,
  assistantGreetingSettingsValidator,
  buildGreetingSettingsResponse,
  MAX_WELCOME_MESSAGE_LENGTH,
  normalizeStarterSuggestions,
  starterSuggestionValidator,
} from "./greeting";
import { buildNamedInstructionsToolDescription } from "./namedInstructions";
import { buildKnowledgeSearchToolDescription } from "./knowledgeFiles";
import {
  ASSISTANT_PUBLIC_DEFAULT_CUSTOM_INSTRUCTIONS,
  ASSISTANT_PUBLIC_FIXED_INSTRUCTIONS,
} from "./promptData";
import {
  buildCleanupSettingsResponse,
  buildShowCoursesCatalogResult,
  buildSendWhatsAppSupportResult,
  buildToolKnowledgeList,
  cleanupSettingsValidator,
  coursesCatalogSettingsValidator,
  getSettingsDoc,
  MAX_CLEANUP_PROMPT_LENGTH,
  MAX_COURSES_CATALOG_MESSAGE_LENGTH,
  MAX_CUSTOM_INSTRUCTIONS_LENGTH,
  MAX_DESCRIPTION_ADDON_LENGTH,
  MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH,
  normalizeToolOverrides,
  toolKnowledgeItemValidator,
  whatsAppSupportSettingsValidator,
} from "./settings";
import {
  COURSES_CATALOG_DEFAULTS,
  PUBLIC_ASSISTANT_TOOL_IDS,
  WHATSAPP_SUPPORT_DEFAULTS,
  assistantToolIdValidator,
  isPublicAssistantToolId,
  type AssistantToolId,
  type AssistantToolOverride,
} from "./toolsCatalog";

const PUBLIC_SETTINGS_KEY = "public" as const;
const MAX_CLEANUP_MODEL_LENGTH = 100;

async function requireSettingsEditor(ctx: MutationCtx | Parameters<typeof requireUser>[0]) {
  await requireUser(ctx, { requireGodOrTech: true });
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required");
  }
  return userId as Id<"users">;
}

async function upsertPublicSettings(
  ctx: MutationCtx,
  userId: Id<"users">,
  patch: Partial<Omit<Doc<"assistantSettings">, "_id" | "_creationTime" | "key">>,
): Promise<number> {
  const now = Date.now();
  const existing = await getSettingsDoc(ctx, PUBLIC_SETTINGS_KEY);
  if (existing) {
    await ctx.db.patch(existing._id, {
      ...patch,
      updatedAt: now,
      updatedBy: userId,
    });
  } else {
    await ctx.db.insert("assistantSettings", {
      key: PUBLIC_SETTINGS_KEY,
      customInstructions: ASSISTANT_PUBLIC_DEFAULT_CUSTOM_INSTRUCTIONS,
      ...patch,
      updatedAt: now,
      updatedBy: userId,
    });
  }
  return now;
}

async function loadToolRuntimeDescriptions(ctx: Parameters<typeof getSettingsDoc>[0]) {
  const activeFiles = await ctx.db
    .query("assistantKnowledgeFiles")
    .withIndex("by_isActive", (q) => q.eq("isActive", true))
    .take(5);
  const activeFile = activeFiles.find((file) => file.status === "ready") ?? null;

  let knowledgeRuntimeDescription: string | null = null;
  if (activeFile) {
    const sheets = await ctx.db
      .query("assistantKnowledgeSheets")
      .withIndex("by_fileId", (q) => q.eq("fileId", activeFile._id))
      .take(100);
    knowledgeRuntimeDescription = buildKnowledgeSearchToolDescription({
      fileId: activeFile._id,
      fileName: activeFile.fileName,
      description: activeFile.description ?? "",
      languages: activeFile.languages ?? [],
      whenToUse: activeFile.whenToUse ?? "",
      howToSearch: activeFile.howToSearch ?? "",
      exampleQueries: activeFile.exampleQueries ?? [],
      toolDescription: activeFile.toolDescription ?? "",
      sheets: sheets
        .sort((a, b) => a.sheetIndex - b.sheetIndex)
        .map((sheet) => ({
          sheetId: sheet._id,
          name: sheet.name,
          headers: sheet.headers,
          purpose: sheet.purpose ?? "",
          searchMode: sheet.searchMode,
          languages: sheet.languages ?? [],
          keywords: sheet.keywords ?? [],
          searchHints: sheet.searchHints ?? "",
          rowCount: sheet.rowCount,
        })),
    });
  }

  const enabledNamedInstructions = await ctx.db
    .query("assistantNamedInstructions")
    .withIndex("by_enabled_and_sortOrder", (q) => q.eq("enabled", true))
    .take(100);
  let namedInstructionsRuntimeDescription: string | null = null;
  if (enabledNamedInstructions.length > 0) {
    namedInstructionsRuntimeDescription = buildNamedInstructionsToolDescription({
      instructions: [...enabledNamedInstructions]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map((row) => ({
          name: row.name,
          title: row.title,
          whenToUse: row.whenToUse,
        })),
    });
  }

  return { knowledgeRuntimeDescription, namedInstructionsRuntimeDescription };
}

export const getPublicAssistantSettings = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    customInstructions: v.string(),
    fixedInstructions: v.string(),
    defaultCustomInstructions: v.string(),
    tools: v.array(toolKnowledgeItemValidator),
    coursesCatalog: coursesCatalogSettingsValidator,
    whatsAppSupport: whatsAppSupportSettingsValidator,
    greeting: assistantGreetingSettingsValidator,
    cleanup: cleanupSettingsValidator,
    updatedAt: v.optional(v.number()),
  }),
  handler: async (ctx) => {
    await requireUser(ctx, { requireGodOrTech: true });

    const settings = await getSettingsDoc(ctx, PUBLIC_SETTINGS_KEY);
    const overrides = normalizeToolOverrides(settings?.toolOverrides);
    const catalogResult = buildShowCoursesCatalogResult(settings);
    const whatsAppResult = buildSendWhatsAppSupportResult(settings);
    const { knowledgeRuntimeDescription, namedInstructionsRuntimeDescription } =
      await loadToolRuntimeDescriptions(ctx);

    return {
      enabled: settings?.publicEnabled === true,
      customInstructions:
        settings?.customInstructions ?? ASSISTANT_PUBLIC_DEFAULT_CUSTOM_INSTRUCTIONS,
      fixedInstructions: ASSISTANT_PUBLIC_FIXED_INSTRUCTIONS,
      defaultCustomInstructions: ASSISTANT_PUBLIC_DEFAULT_CUSTOM_INSTRUCTIONS,
      tools: buildToolKnowledgeList(
        overrides,
        knowledgeRuntimeDescription,
        namedInstructionsRuntimeDescription,
        PUBLIC_ASSISTANT_TOOL_IDS,
      ),
      coursesCatalog: {
        messageEn: catalogResult.messageEn,
        messageAr: catalogResult.messageAr,
        defaultMessageEn: COURSES_CATALOG_DEFAULTS.messageEn,
        defaultMessageAr: COURSES_CATALOG_DEFAULTS.messageAr,
        buttonTextEn: catalogResult.buttonTextEn,
        buttonTextAr: catalogResult.buttonTextAr,
        urlEn: catalogResult.urlEn,
        urlAr: catalogResult.urlAr,
      },
      whatsAppSupport: {
        messageEn: whatsAppResult.messageEn,
        messageAr: whatsAppResult.messageAr,
        defaultMessageEn: WHATSAPP_SUPPORT_DEFAULTS.messageEn,
        defaultMessageAr: WHATSAPP_SUPPORT_DEFAULTS.messageAr,
        buttonTextEn: whatsAppResult.buttonTextEn,
        buttonTextAr: whatsAppResult.buttonTextAr,
        url: whatsAppResult.url,
      },
      greeting: buildGreetingSettingsResponse(settings, PUBLIC_ASSISTANT_GREETING_DEFAULTS),
      cleanup: buildCleanupSettingsResponse(settings),
      updatedAt: settings?.updatedAt,
    };
  },
});

export const updatePublicAssistantEnabled = mutation({
  args: {
    enabled: v.boolean(),
  },
  returns: v.object({
    updatedAt: v.number(),
    enabled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireSettingsEditor(ctx);
    const updatedAt = await upsertPublicSettings(ctx, userId, {
      publicEnabled: args.enabled,
    });
    return { updatedAt, enabled: args.enabled };
  },
});

export const updatePublicAssistantSettings = mutation({
  args: {
    customInstructions: v.string(),
  },
  returns: v.object({
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireSettingsEditor(ctx);
    const customInstructions = args.customInstructions.trim();
    if (customInstructions.length === 0) {
      throw new Error("Custom instructions cannot be empty");
    }
    if (customInstructions.length > MAX_CUSTOM_INSTRUCTIONS_LENGTH) {
      throw new Error(
        `Custom instructions are too long (${customInstructions.length.toLocaleString()} characters). Please shorten them to ${MAX_CUSTOM_INSTRUCTIONS_LENGTH.toLocaleString()} characters or fewer.`,
      );
    }
    const updatedAt = await upsertPublicSettings(ctx, userId, { customInstructions });
    return { updatedAt };
  },
});

export const updatePublicAssistantToolKnowledge = mutation({
  args: {
    toolId: assistantToolIdValidator,
    enabled: v.optional(v.boolean()),
    descriptionAddon: v.optional(v.string()),
  },
  returns: v.object({
    updatedAt: v.number(),
    tool: toolKnowledgeItemValidator,
  }),
  handler: async (ctx, args) => {
    const userId = await requireSettingsEditor(ctx);
    if (!isPublicAssistantToolId(args.toolId)) {
      throw new Error("This tool is not available on the public assistant");
    }
    if (args.enabled === undefined && args.descriptionAddon === undefined) {
      throw new Error("Nothing to update");
    }
    if (
      args.descriptionAddon !== undefined &&
      args.descriptionAddon.length > MAX_DESCRIPTION_ADDON_LENGTH
    ) {
      throw new Error(
        `Additional description is too long (${args.descriptionAddon.length.toLocaleString()} characters). Please shorten it to ${MAX_DESCRIPTION_ADDON_LENGTH.toLocaleString()} characters or fewer.`,
      );
    }

    const existing = await getSettingsDoc(ctx, PUBLIC_SETTINGS_KEY);
    const currentOverrides = normalizeToolOverrides(existing?.toolOverrides);
    const toolId: AssistantToolId = args.toolId;
    const previous = currentOverrides[toolId];
    const nextOverride: AssistantToolOverride = {
      enabled: args.enabled ?? previous?.enabled ?? true,
      descriptionAddon:
        args.descriptionAddon !== undefined
          ? args.descriptionAddon
          : (previous?.descriptionAddon ?? ""),
    };
    const nextOverrides: Record<string, AssistantToolOverride> = {
      ...currentOverrides,
      [toolId]: nextOverride,
    };

    const updatedAt = await upsertPublicSettings(ctx, userId, {
      toolOverrides: nextOverrides,
    });
    const tools = buildToolKnowledgeList(
      normalizeToolOverrides(nextOverrides),
      null,
      null,
      PUBLIC_ASSISTANT_TOOL_IDS,
    );
    const tool = tools.find((item) => item.toolId === toolId);
    if (!tool) {
      throw new Error("Tool not found");
    }
    return { updatedAt, tool };
  },
});

export const updatePublicAssistantGreeting = mutation({
  args: {
    welcomeMessageEn: v.string(),
    welcomeMessageAr: v.string(),
    starterSuggestions: v.array(starterSuggestionValidator),
  },
  returns: v.object({
    updatedAt: v.number(),
    greeting: assistantGreetingSettingsValidator,
  }),
  handler: async (ctx, args) => {
    const userId = await requireSettingsEditor(ctx);
    if (args.welcomeMessageEn.length > MAX_WELCOME_MESSAGE_LENGTH) {
      throw new Error(
        `English welcome message is too long (${args.welcomeMessageEn.length.toLocaleString()} characters). Please shorten it to ${MAX_WELCOME_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`,
      );
    }
    if (args.welcomeMessageAr.length > MAX_WELCOME_MESSAGE_LENGTH) {
      throw new Error(
        `Arabic welcome message is too long (${args.welcomeMessageAr.length.toLocaleString()} characters). Please shorten it to ${MAX_WELCOME_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`,
      );
    }

    const starterSuggestions = normalizeStarterSuggestions(args.starterSuggestions);
    const welcomeMessageEn = args.welcomeMessageEn.trim();
    const welcomeMessageAr = args.welcomeMessageAr.trim();
    const updatedAt = await upsertPublicSettings(ctx, userId, {
      welcomeMessageEn,
      welcomeMessageAr,
      starterSuggestions,
    });

    return {
      updatedAt,
      greeting: buildGreetingSettingsResponse(
        { welcomeMessageEn, welcomeMessageAr, starterSuggestions },
        PUBLIC_ASSISTANT_GREETING_DEFAULTS,
      ),
    };
  },
});

export const updatePublicCoursesCatalogMessages = mutation({
  args: {
    messageEn: v.string(),
    messageAr: v.string(),
  },
  returns: v.object({
    updatedAt: v.number(),
    coursesCatalog: coursesCatalogSettingsValidator,
  }),
  handler: async (ctx, args) => {
    const userId = await requireSettingsEditor(ctx);
    if (args.messageEn.length > MAX_COURSES_CATALOG_MESSAGE_LENGTH) {
      throw new Error(
        `English catalog message is too long (${args.messageEn.length.toLocaleString()} characters). Please shorten it to ${MAX_COURSES_CATALOG_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`,
      );
    }
    if (args.messageAr.length > MAX_COURSES_CATALOG_MESSAGE_LENGTH) {
      throw new Error(
        `Arabic catalog message is too long (${args.messageAr.length.toLocaleString()} characters). Please shorten it to ${MAX_COURSES_CATALOG_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`,
      );
    }

    const coursesCatalogMessageEn = args.messageEn.trim();
    const coursesCatalogMessageAr = args.messageAr.trim();
    const updatedAt = await upsertPublicSettings(ctx, userId, {
      coursesCatalogMessageEn,
      coursesCatalogMessageAr,
    });
    const catalogResult = buildShowCoursesCatalogResult({
      coursesCatalogMessageEn,
      coursesCatalogMessageAr,
    });

    return {
      updatedAt,
      coursesCatalog: {
        messageEn: catalogResult.messageEn,
        messageAr: catalogResult.messageAr,
        defaultMessageEn: COURSES_CATALOG_DEFAULTS.messageEn,
        defaultMessageAr: COURSES_CATALOG_DEFAULTS.messageAr,
        buttonTextEn: catalogResult.buttonTextEn,
        buttonTextAr: catalogResult.buttonTextAr,
        urlEn: catalogResult.urlEn,
        urlAr: catalogResult.urlAr,
      },
    };
  },
});

export const updatePublicWhatsAppSupportMessages = mutation({
  args: {
    messageEn: v.string(),
    messageAr: v.string(),
  },
  returns: v.object({
    updatedAt: v.number(),
    whatsAppSupport: whatsAppSupportSettingsValidator,
  }),
  handler: async (ctx, args) => {
    const userId = await requireSettingsEditor(ctx);
    if (args.messageEn.length > MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH) {
      throw new Error(
        `English WhatsApp support message is too long (${args.messageEn.length.toLocaleString()} characters). Please shorten it to ${MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`,
      );
    }
    if (args.messageAr.length > MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH) {
      throw new Error(
        `Arabic WhatsApp support message is too long (${args.messageAr.length.toLocaleString()} characters). Please shorten it to ${MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`,
      );
    }

    const whatsAppSupportMessageEn = args.messageEn.trim();
    const whatsAppSupportMessageAr = args.messageAr.trim();
    const updatedAt = await upsertPublicSettings(ctx, userId, {
      whatsAppSupportMessageEn,
      whatsAppSupportMessageAr,
    });
    const whatsAppResult = buildSendWhatsAppSupportResult({
      whatsAppSupportMessageEn,
      whatsAppSupportMessageAr,
    });

    return {
      updatedAt,
      whatsAppSupport: {
        messageEn: whatsAppResult.messageEn,
        messageAr: whatsAppResult.messageAr,
        defaultMessageEn: WHATSAPP_SUPPORT_DEFAULTS.messageEn,
        defaultMessageAr: WHATSAPP_SUPPORT_DEFAULTS.messageAr,
        buttonTextEn: whatsAppResult.buttonTextEn,
        buttonTextAr: whatsAppResult.buttonTextAr,
        url: whatsAppResult.url,
      },
    };
  },
});

export const updatePublicCleanupSettings = mutation({
  args: {
    ctaSystemPrompt: v.string(),
    streamSystemPrompt: v.string(),
    ctaUserPromptTemplate: v.string(),
    streamUserPromptTemplate: v.string(),
    model: v.string(),
    ctaTemperature: v.number(),
  },
  returns: v.object({
    updatedAt: v.number(),
    cleanup: cleanupSettingsValidator,
  }),
  handler: async (ctx, args) => {
    const userId = await requireSettingsEditor(ctx);
    const ctaSystemPrompt = args.ctaSystemPrompt.trim();
    const streamSystemPrompt = args.streamSystemPrompt.trim();
    const ctaUserPromptTemplate = args.ctaUserPromptTemplate.trim();
    const streamUserPromptTemplate = args.streamUserPromptTemplate.trim();
    const model = args.model.trim();

    if (ctaSystemPrompt.length === 0) {
      throw new Error("CTA system prompt cannot be empty");
    }
    if (streamSystemPrompt.length === 0) {
      throw new Error("Rewrite system prompt cannot be empty");
    }
    if (ctaUserPromptTemplate.length === 0) {
      throw new Error("CTA user prompt template cannot be empty");
    }
    if (streamUserPromptTemplate.length === 0) {
      throw new Error("Rewrite user prompt template cannot be empty");
    }
    if (!ctaUserPromptTemplate.includes("{{draftText}}")) {
      throw new Error("CTA user prompt template must include {{draftText}}");
    }
    if (!ctaUserPromptTemplate.includes("{{inventoryJson}}")) {
      throw new Error("CTA user prompt template must include {{inventoryJson}}");
    }
    if (!streamUserPromptTemplate.includes("{{draftText}}")) {
      throw new Error("Rewrite user prompt template must include {{draftText}}");
    }

    for (const [label, value] of [
      ["CTA system prompt", ctaSystemPrompt],
      ["Rewrite system prompt", streamSystemPrompt],
      ["CTA user prompt template", ctaUserPromptTemplate],
      ["Rewrite user prompt template", streamUserPromptTemplate],
    ] as const) {
      if (value.length > MAX_CLEANUP_PROMPT_LENGTH) {
        throw new Error(
          `${label} is too long (${value.length.toLocaleString()} characters). Please shorten it to ${MAX_CLEANUP_PROMPT_LENGTH.toLocaleString()} characters or fewer.`,
        );
      }
    }

    if (model.length > MAX_CLEANUP_MODEL_LENGTH) {
      throw new Error(
        `Model id is too long (${model.length.toLocaleString()} characters). Please shorten it to ${MAX_CLEANUP_MODEL_LENGTH.toLocaleString()} characters or fewer.`,
      );
    }

    if (!Number.isFinite(args.ctaTemperature) || args.ctaTemperature < 0 || args.ctaTemperature > 2) {
      throw new Error("CTA temperature must be a number between 0 and 2");
    }

    const updatedAt = await upsertPublicSettings(ctx, userId, {
      cleanupCtaSystemPrompt: ctaSystemPrompt,
      cleanupStreamSystemPrompt: streamSystemPrompt,
      cleanupCtaUserPromptTemplate: ctaUserPromptTemplate,
      cleanupStreamUserPromptTemplate: streamUserPromptTemplate,
      cleanupModel: model,
      cleanupCtaTemperature: args.ctaTemperature,
    });

    return {
      updatedAt,
      cleanup: buildCleanupSettingsResponse({
        cleanupCtaSystemPrompt: ctaSystemPrompt,
        cleanupStreamSystemPrompt: streamSystemPrompt,
        cleanupCtaUserPromptTemplate: ctaUserPromptTemplate,
        cleanupStreamUserPromptTemplate: streamUserPromptTemplate,
        cleanupModel: model,
        cleanupCtaTemperature: args.ctaTemperature,
      }),
    };
  },
});

export const copyPublicSettingsFromMembers = mutation({
  args: {},
  returns: v.object({
    updatedAt: v.number(),
  }),
  handler: async (ctx) => {
    const userId = await requireSettingsEditor(ctx);
    const members = await getSettingsDoc(ctx, "global");
    if (!members) {
      throw new Error("Members assistant settings are empty. Save the members assistant first.");
    }

    const memberOverrides = normalizeToolOverrides(members.toolOverrides);
    const publicToolOverrides: Record<string, AssistantToolOverride> = {};
    for (const toolId of PUBLIC_ASSISTANT_TOOL_IDS) {
      const fromMember = memberOverrides[toolId];
      publicToolOverrides[toolId] = {
        enabled: fromMember?.enabled ?? true,
        descriptionAddon: fromMember?.descriptionAddon ?? "",
      };
    }

    const updatedAt = await upsertPublicSettings(ctx, userId, {
      customInstructions:
        members.customInstructions || ASSISTANT_PUBLIC_DEFAULT_CUSTOM_INSTRUCTIONS,
      toolOverrides: publicToolOverrides,
      coursesCatalogMessageEn: members.coursesCatalogMessageEn,
      coursesCatalogMessageAr: members.coursesCatalogMessageAr,
      whatsAppSupportMessageEn: members.whatsAppSupportMessageEn,
      whatsAppSupportMessageAr: members.whatsAppSupportMessageAr,
      welcomeMessageEn: members.welcomeMessageEn,
      welcomeMessageAr: members.welcomeMessageAr,
      starterSuggestions: members.starterSuggestions,
      cleanupCtaSystemPrompt: members.cleanupCtaSystemPrompt,
      cleanupStreamSystemPrompt: members.cleanupStreamSystemPrompt,
      cleanupCtaUserPromptTemplate: members.cleanupCtaUserPromptTemplate,
      cleanupStreamUserPromptTemplate: members.cleanupStreamUserPromptTemplate,
      cleanupModel: members.cleanupModel,
      cleanupCtaTemperature: members.cleanupCtaTemperature,
    });

    return { updatedAt };
  },
});
