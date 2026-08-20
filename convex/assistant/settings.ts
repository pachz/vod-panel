import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireUser } from "../utils/auth";
import {
  ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS,
  ASSISTANT_FIXED_INSTRUCTIONS,
  loadCustomInstructions,
} from "./promptData";
import {
  ASSISTANT_CLEANUP_CTA_SYSTEM,
  ASSISTANT_CLEANUP_CTA_USER_PROMPT_TEMPLATE,
  ASSISTANT_CLEANUP_DEFAULT_CTA_TEMPERATURE,
  ASSISTANT_CLEANUP_STREAM_SYSTEM,
  ASSISTANT_CLEANUP_STREAM_USER_PROMPT_TEMPLATE,
  resolveCleanupCtaTemperature,
  resolveCleanupModelId,
  type CleanupRuntimeSettings,
} from "./cleanup";
import {
  ASSISTANT_TOOL_CATALOG,
  ASSISTANT_TOOL_IDS,
  COURSES_CATALOG_DEFAULTS,
  WHATSAPP_SUPPORT_DEFAULTS,
  assistantToolIdValidator,
  isAssistantToolId,
  type AssistantToolId,
  type AssistantToolOverride,
  type AssistantToolOverrides,
} from "./toolsCatalog";
import { buildKnowledgeSearchToolDescription } from "./knowledgeFiles";
import {
  buildNamedInstructionsToolDescription,
  type NamedInstructionsToolContext,
} from "./namedInstructions";
import {
  sendWhatsAppSupportResultValidator,
  showCoursesCatalogResultValidator,
} from "./validators";
import type { Infer } from "convex/values";

const SETTINGS_KEY = "global" as const;
const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 20_000;
const MAX_DESCRIPTION_ADDON_LENGTH = 4_000;
const MAX_COURSES_CATALOG_MESSAGE_LENGTH = 500;
const MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH = 500;
const MAX_WHATSAPP_PREFILL_LENGTH = 300;
const MAX_CLEANUP_PROMPT_LENGTH = 20_000;
const MAX_CLEANUP_MODEL_LENGTH = 100;

type ShowCoursesCatalogResult = Infer<typeof showCoursesCatalogResultValidator>;
type SendWhatsAppSupportResult = Infer<typeof sendWhatsAppSupportResultValidator>;

const toolKnowledgeItemValidator = v.object({
  toolId: assistantToolIdValidator,
  label: v.string(),
  summary: v.string(),
  defaultDescription: v.string(),
  enabled: v.boolean(),
  descriptionAddon: v.string(),
  effectiveDescription: v.string(),
});

const coursesCatalogSettingsValidator = v.object({
  messageEn: v.string(),
  messageAr: v.string(),
  defaultMessageEn: v.string(),
  defaultMessageAr: v.string(),
  buttonTextEn: v.string(),
  buttonTextAr: v.string(),
  urlEn: v.string(),
  urlAr: v.string(),
});

const whatsAppSupportSettingsValidator = v.object({
  messageEn: v.string(),
  messageAr: v.string(),
  defaultMessageEn: v.string(),
  defaultMessageAr: v.string(),
  buttonTextEn: v.string(),
  buttonTextAr: v.string(),
  url: v.string(),
});

const cleanupSettingsValidator = v.object({
  ctaSystemPrompt: v.string(),
  streamSystemPrompt: v.string(),
  ctaUserPromptTemplate: v.string(),
  streamUserPromptTemplate: v.string(),
  model: v.string(),
  ctaTemperature: v.number(),
  defaultCtaSystemPrompt: v.string(),
  defaultStreamSystemPrompt: v.string(),
  defaultCtaUserPromptTemplate: v.string(),
  defaultStreamUserPromptTemplate: v.string(),
  defaultModel: v.string(),
  defaultCtaTemperature: v.number(),
});

function resolveCleanupSettings(settings: {
  cleanupCtaSystemPrompt?: string;
  cleanupStreamSystemPrompt?: string;
  cleanupCtaUserPromptTemplate?: string;
  cleanupStreamUserPromptTemplate?: string;
  cleanupModel?: string;
  cleanupCtaTemperature?: number;
} | null): CleanupRuntimeSettings {
  return {
    ctaSystemPrompt:
      settings?.cleanupCtaSystemPrompt?.trim() || ASSISTANT_CLEANUP_CTA_SYSTEM,
    streamSystemPrompt:
      settings?.cleanupStreamSystemPrompt?.trim() || ASSISTANT_CLEANUP_STREAM_SYSTEM,
    ctaUserPromptTemplate:
      settings?.cleanupCtaUserPromptTemplate?.trim() ||
      ASSISTANT_CLEANUP_CTA_USER_PROMPT_TEMPLATE,
    streamUserPromptTemplate:
      settings?.cleanupStreamUserPromptTemplate?.trim() ||
      ASSISTANT_CLEANUP_STREAM_USER_PROMPT_TEMPLATE,
    model: resolveCleanupModelId(settings?.cleanupModel),
    ctaTemperature: resolveCleanupCtaTemperature(settings?.cleanupCtaTemperature),
  };
}

function buildCleanupSettingsResponse(settings: {
  cleanupCtaSystemPrompt?: string;
  cleanupStreamSystemPrompt?: string;
  cleanupCtaUserPromptTemplate?: string;
  cleanupStreamUserPromptTemplate?: string;
  cleanupModel?: string;
  cleanupCtaTemperature?: number;
} | null) {
  const resolved = resolveCleanupSettings(settings);
  const storedModel = settings?.cleanupModel?.trim() ?? "";
  return {
    ctaSystemPrompt: resolved.ctaSystemPrompt,
    streamSystemPrompt: resolved.streamSystemPrompt,
    ctaUserPromptTemplate: resolved.ctaUserPromptTemplate,
    streamUserPromptTemplate: resolved.streamUserPromptTemplate,
    // Expose stored override (may be empty) for the admin editor; runtime uses resolved.model.
    model: storedModel,
    ctaTemperature: resolved.ctaTemperature,
    defaultCtaSystemPrompt: ASSISTANT_CLEANUP_CTA_SYSTEM,
    defaultStreamSystemPrompt: ASSISTANT_CLEANUP_STREAM_SYSTEM,
    defaultCtaUserPromptTemplate: ASSISTANT_CLEANUP_CTA_USER_PROMPT_TEMPLATE,
    defaultStreamUserPromptTemplate: ASSISTANT_CLEANUP_STREAM_USER_PROMPT_TEMPLATE,
    defaultModel: resolveCleanupModelId(null),
    defaultCtaTemperature: ASSISTANT_CLEANUP_DEFAULT_CTA_TEMPERATURE,
  };
}

function resolveCoursesCatalogMessages(settings: {
  coursesCatalogMessageEn?: string;
  coursesCatalogMessageAr?: string;
} | null): { messageEn: string; messageAr: string } {
  const messageEn = settings?.coursesCatalogMessageEn?.trim();
  const messageAr = settings?.coursesCatalogMessageAr?.trim();
  return {
    messageEn: messageEn || COURSES_CATALOG_DEFAULTS.messageEn,
    messageAr: messageAr || COURSES_CATALOG_DEFAULTS.messageAr,
  };
}

export function buildShowCoursesCatalogResult(settings: {
  coursesCatalogMessageEn?: string;
  coursesCatalogMessageAr?: string;
} | null): ShowCoursesCatalogResult {
  const messages = resolveCoursesCatalogMessages(settings);
  return {
    messageEn: messages.messageEn,
    messageAr: messages.messageAr,
    buttonTextEn: COURSES_CATALOG_DEFAULTS.buttonTextEn,
    buttonTextAr: COURSES_CATALOG_DEFAULTS.buttonTextAr,
    urlEn: COURSES_CATALOG_DEFAULTS.urlEn,
    urlAr: COURSES_CATALOG_DEFAULTS.urlAr,
  };
}

function resolveWhatsAppSupportMessages(settings: {
  whatsAppSupportMessageEn?: string;
  whatsAppSupportMessageAr?: string;
} | null): { messageEn: string; messageAr: string } {
  const messageEn = settings?.whatsAppSupportMessageEn?.trim();
  const messageAr = settings?.whatsAppSupportMessageAr?.trim();
  return {
    messageEn: messageEn || WHATSAPP_SUPPORT_DEFAULTS.messageEn,
    messageAr: messageAr || WHATSAPP_SUPPORT_DEFAULTS.messageAr,
  };
}

export function buildWhatsAppSupportUrl(prefillText?: string | null): string {
  const base = WHATSAPP_SUPPORT_DEFAULTS.url;
  const text = prefillText?.trim();
  if (!text) {
    return base;
  }
  return `${base}?text=${encodeURIComponent(text.slice(0, MAX_WHATSAPP_PREFILL_LENGTH))}`;
}

export function buildSendWhatsAppSupportResult(
  settings: {
    whatsAppSupportMessageEn?: string;
    whatsAppSupportMessageAr?: string;
  } | null,
  prefillText?: string | null,
): SendWhatsAppSupportResult {
  const messages = resolveWhatsAppSupportMessages(settings);
  return {
    messageEn: messages.messageEn,
    messageAr: messages.messageAr,
    buttonTextEn: WHATSAPP_SUPPORT_DEFAULTS.buttonTextEn,
    buttonTextAr: WHATSAPP_SUPPORT_DEFAULTS.buttonTextAr,
    url: buildWhatsAppSupportUrl(prefillText),
  };
}

async function getSettingsDoc(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("assistantSettings")
    .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
    .unique();
}

function normalizeToolOverrides(
  raw: Record<string, AssistantToolOverride> | undefined,
): AssistantToolOverrides {
  if (!raw) {
    return {};
  }

  const normalized: AssistantToolOverrides = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isAssistantToolId(key)) {
      continue;
    }
    normalized[key] = {
      enabled: value.enabled,
      descriptionAddon: value.descriptionAddon ?? "",
    };
  }
  return normalized;
}

function buildToolKnowledgeList(
  overrides: AssistantToolOverrides,
  knowledgeRuntimeDescription?: string | null,
  namedInstructionsRuntimeDescription?: string | null,
) {
  return ASSISTANT_TOOL_IDS.map((toolId) => {
    const catalog = ASSISTANT_TOOL_CATALOG[toolId];
    const override = overrides[toolId];
    const descriptionAddon = override?.descriptionAddon ?? "";
    const enabled = override?.enabled !== false;
    const addonTrimmed = descriptionAddon.trim();
    let defaultDescription = catalog.defaultDescription;
    if (toolId === "searchKnowledgeBase" && knowledgeRuntimeDescription?.trim()) {
      defaultDescription = knowledgeRuntimeDescription.trim();
    } else if (
      toolId === "getNamedInstructions" &&
      namedInstructionsRuntimeDescription?.trim()
    ) {
      defaultDescription = namedInstructionsRuntimeDescription.trim();
    }
    const effectiveDescription =
      addonTrimmed.length > 0
        ? `${defaultDescription}\n\nAdditional guidance:\n${addonTrimmed}`
        : defaultDescription;

    return {
      toolId,
      label: catalog.label,
      summary: catalog.summary,
      defaultDescription,
      enabled,
      descriptionAddon,
      effectiveDescription,
    };
  });
}

export const getCustomInstructionsInternal = internalQuery({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    return await loadCustomInstructions(ctx);
  },
});

export const getToolOverridesInternal = internalQuery({
  args: {},
  returns: v.record(
    v.string(),
    v.object({
      enabled: v.boolean(),
      descriptionAddon: v.string(),
    }),
  ),
  handler: async (ctx): Promise<AssistantToolOverrides> => {
    const settings = await getSettingsDoc(ctx);
    return normalizeToolOverrides(settings?.toolOverrides);
  },
});

export const getShowCoursesCatalogInternal = internalQuery({
  args: {},
  returns: showCoursesCatalogResultValidator,
  handler: async (ctx): Promise<ShowCoursesCatalogResult> => {
    const settings = await getSettingsDoc(ctx);
    return buildShowCoursesCatalogResult(settings);
  },
});

export const getSendWhatsAppSupportInternal = internalQuery({
  args: {
    text: v.optional(v.string()),
  },
  returns: sendWhatsAppSupportResultValidator,
  handler: async (ctx, args): Promise<SendWhatsAppSupportResult> => {
    const settings = await getSettingsDoc(ctx);
    return buildSendWhatsAppSupportResult(settings, args.text);
  },
});

export const getCleanupSettingsInternal = internalQuery({
  args: {},
  returns: v.object({
    ctaSystemPrompt: v.string(),
    streamSystemPrompt: v.string(),
    ctaUserPromptTemplate: v.string(),
    streamUserPromptTemplate: v.string(),
    model: v.string(),
    ctaTemperature: v.number(),
  }),
  handler: async (ctx): Promise<CleanupRuntimeSettings> => {
    const settings = await getSettingsDoc(ctx);
    return resolveCleanupSettings(settings);
  },
});

export const getAssistantSettings = query({
  args: {},
  returns: v.object({
    customInstructions: v.string(),
    fixedInstructions: v.string(),
    defaultCustomInstructions: v.string(),
    tools: v.array(toolKnowledgeItemValidator),
    coursesCatalog: coursesCatalogSettingsValidator,
    whatsAppSupport: whatsAppSupportSettingsValidator,
    cleanup: cleanupSettingsValidator,
    updatedAt: v.optional(v.number()),
  }),
  handler: async (ctx) => {
    await requireUser(ctx, { requireGodOrTech: true });

    const settings = await getSettingsDoc(ctx);
    const overrides = normalizeToolOverrides(settings?.toolOverrides);
    const catalogResult = buildShowCoursesCatalogResult(settings);
    const whatsAppResult = buildSendWhatsAppSupportResult(settings);

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
      const context: NamedInstructionsToolContext = {
        instructions: [...enabledNamedInstructions]
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
          .map((row) => ({
            name: row.name,
            title: row.title,
            whenToUse: row.whenToUse,
          })),
      };
      namedInstructionsRuntimeDescription = buildNamedInstructionsToolDescription(context);
    }

    return {
      customInstructions: settings?.customInstructions ?? ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS,
      fixedInstructions: ASSISTANT_FIXED_INSTRUCTIONS,
      defaultCustomInstructions: ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS,
      tools: buildToolKnowledgeList(
        overrides,
        knowledgeRuntimeDescription,
        namedInstructionsRuntimeDescription,
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
      cleanup: buildCleanupSettingsResponse(settings),
      updatedAt: settings?.updatedAt,
    };
  },
});

export const updateAssistantSettings = mutation({
  args: {
    customInstructions: v.string(),
  },
  returns: v.object({
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Authentication required");
    }

    const customInstructions = args.customInstructions.trim();
    if (customInstructions.length === 0) {
      throw new Error("Custom instructions cannot be empty");
    }

    if (customInstructions.length > MAX_CUSTOM_INSTRUCTIONS_LENGTH) {
      throw new Error(
        `Custom instructions are too long (${customInstructions.length.toLocaleString()} characters). Please shorten them to ${MAX_CUSTOM_INSTRUCTIONS_LENGTH.toLocaleString()} characters or fewer.`,
      );
    }

    const now = Date.now();
    const existing = await getSettingsDoc(ctx);

    if (existing) {
      await ctx.db.patch(existing._id, {
        customInstructions,
        updatedAt: now,
        updatedBy: userId,
      });
    } else {
      await ctx.db.insert("assistantSettings", {
        key: SETTINGS_KEY,
        customInstructions,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    return { updatedAt: now };
  },
});

export const updateAssistantToolKnowledge = mutation({
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
    await requireUser(ctx, { requireGodOrTech: true });
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Authentication required");
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

    const now = Date.now();
    const existing = await getSettingsDoc(ctx);
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

    if (existing) {
      await ctx.db.patch(existing._id, {
        toolOverrides: nextOverrides,
        updatedAt: now,
        updatedBy: userId,
      });
    } else {
      await ctx.db.insert("assistantSettings", {
        key: SETTINGS_KEY,
        customInstructions: ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS,
        toolOverrides: nextOverrides,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    const tools = buildToolKnowledgeList(normalizeToolOverrides(nextOverrides));
    const tool = tools.find((item) => item.toolId === toolId);
    if (!tool) {
      throw new Error("Tool not found");
    }

    return { updatedAt: now, tool };
  },
});

export const updateCoursesCatalogMessages = mutation({
  args: {
    messageEn: v.string(),
    messageAr: v.string(),
  },
  returns: v.object({
    updatedAt: v.number(),
    coursesCatalog: coursesCatalogSettingsValidator,
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Authentication required");
    }

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

    const now = Date.now();
    const existing = await getSettingsDoc(ctx);
    const coursesCatalogMessageEn = args.messageEn.trim();
    const coursesCatalogMessageAr = args.messageAr.trim();

    if (existing) {
      await ctx.db.patch(existing._id, {
        coursesCatalogMessageEn,
        coursesCatalogMessageAr,
        updatedAt: now,
        updatedBy: userId,
      });
    } else {
      await ctx.db.insert("assistantSettings", {
        key: SETTINGS_KEY,
        customInstructions: ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS,
        coursesCatalogMessageEn,
        coursesCatalogMessageAr,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    const catalogResult = buildShowCoursesCatalogResult({
      coursesCatalogMessageEn,
      coursesCatalogMessageAr,
    });

    return {
      updatedAt: now,
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

export const updateWhatsAppSupportMessages = mutation({
  args: {
    messageEn: v.string(),
    messageAr: v.string(),
  },
  returns: v.object({
    updatedAt: v.number(),
    whatsAppSupport: whatsAppSupportSettingsValidator,
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Authentication required");
    }

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

    const now = Date.now();
    const existing = await getSettingsDoc(ctx);
    const whatsAppSupportMessageEn = args.messageEn.trim();
    const whatsAppSupportMessageAr = args.messageAr.trim();

    if (existing) {
      await ctx.db.patch(existing._id, {
        whatsAppSupportMessageEn,
        whatsAppSupportMessageAr,
        updatedAt: now,
        updatedBy: userId,
      });
    } else {
      await ctx.db.insert("assistantSettings", {
        key: SETTINGS_KEY,
        customInstructions: ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS,
        whatsAppSupportMessageEn,
        whatsAppSupportMessageAr,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    const whatsAppResult = buildSendWhatsAppSupportResult({
      whatsAppSupportMessageEn,
      whatsAppSupportMessageAr,
    });

    return {
      updatedAt: now,
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

export const updateCleanupSettings = mutation({
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
    await requireUser(ctx, { requireGodOrTech: true });
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Authentication required");
    }

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

    const now = Date.now();
    const existing = await getSettingsDoc(ctx);
    const patch = {
      cleanupCtaSystemPrompt: ctaSystemPrompt,
      cleanupStreamSystemPrompt: streamSystemPrompt,
      cleanupCtaUserPromptTemplate: ctaUserPromptTemplate,
      cleanupStreamUserPromptTemplate: streamUserPromptTemplate,
      cleanupModel: model,
      cleanupCtaTemperature: args.ctaTemperature,
      updatedAt: now,
      updatedBy: userId,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("assistantSettings", {
        key: SETTINGS_KEY,
        customInstructions: ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS,
        ...patch,
      });
    }

    return {
      updatedAt: now,
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
