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
  ASSISTANT_TOOL_CATALOG,
  ASSISTANT_TOOL_IDS,
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

const SETTINGS_KEY = "global" as const;
const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 20_000;
const MAX_DESCRIPTION_ADDON_LENGTH = 4_000;

const toolKnowledgeItemValidator = v.object({
  toolId: assistantToolIdValidator,
  label: v.string(),
  summary: v.string(),
  defaultDescription: v.string(),
  enabled: v.boolean(),
  descriptionAddon: v.string(),
  effectiveDescription: v.string(),
});

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

export const getAssistantSettings = query({
  args: {},
  returns: v.object({
    customInstructions: v.string(),
    fixedInstructions: v.string(),
    defaultCustomInstructions: v.string(),
    tools: v.array(toolKnowledgeItemValidator),
    updatedAt: v.optional(v.number()),
  }),
  handler: async (ctx) => {
    await requireUser(ctx, { requireGodOrTech: true });

    const settings = await getSettingsDoc(ctx);
    const overrides = normalizeToolOverrides(settings?.toolOverrides);

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
