import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "../_generated/server";
import { requireUser } from "../utils/auth";

const ALLOWED_EXTENSIONS = new Set([".csv", ".xls", ".xlsx"]);
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const ROW_INSERT_BATCH_SIZE = 80;
const ROW_DELETE_BATCH_SIZE = 100;

export const fileStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
  v.literal("deleting"),
);

export const processingStageValidator = v.union(
  v.literal("queued"),
  v.literal("parsing"),
  v.literal("describing"),
  v.literal("indexing"),
  v.literal("saving"),
);

export const searchModeValidator = v.union(
  v.literal("semantic"),
  v.literal("structured"),
  v.literal("hybrid"),
);

const knowledgeFileListItemValidator = v.object({
  _id: v.id("assistantKnowledgeFiles"),
  fileName: v.string(),
  contentType: v.string(),
  sizeBytes: v.number(),
  status: fileStatusValidator,
  processingStage: v.optional(processingStageValidator),
  processingProgress: v.optional(v.number()),
  description: v.optional(v.string()),
  languages: v.optional(v.array(v.string())),
  whenToUse: v.optional(v.string()),
  howToSearch: v.optional(v.string()),
  exampleQueries: v.optional(v.array(v.string())),
  toolDescription: v.optional(v.string()),
  isActive: v.boolean(),
  errorMessage: v.optional(v.string()),
  sheetCount: v.optional(v.number()),
  rowCount: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const knowledgeSheetValidator = v.object({
  _id: v.id("assistantKnowledgeSheets"),
  fileId: v.id("assistantKnowledgeFiles"),
  name: v.string(),
  headers: v.array(v.string()),
  purpose: v.optional(v.string()),
  searchMode: searchModeValidator,
  languages: v.optional(v.array(v.string())),
  keywords: v.optional(v.array(v.string())),
  searchHints: v.optional(v.string()),
  rowCount: v.number(),
  sheetIndex: v.number(),
});

const parsedRowValidator = v.object({
  rowIndex: v.number(),
  data: v.array(
    v.object({
      header: v.string(),
      value: v.string(),
    }),
  ),
  searchableText: v.string(),
  embedding: v.optional(v.array(v.float64())),
});

export const activeKnowledgeToolContextValidator = v.object({
  fileId: v.id("assistantKnowledgeFiles"),
  fileName: v.string(),
  description: v.string(),
  languages: v.array(v.string()),
  whenToUse: v.string(),
  howToSearch: v.string(),
  exampleQueries: v.array(v.string()),
  toolDescription: v.string(),
  sheets: v.array(
    v.object({
      sheetId: v.id("assistantKnowledgeSheets"),
      name: v.string(),
      headers: v.array(v.string()),
      purpose: v.string(),
      searchMode: searchModeValidator,
      languages: v.array(v.string()),
      keywords: v.array(v.string()),
      searchHints: v.string(),
      rowCount: v.number(),
    }),
  ),
});

function hasAllowedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  for (const ext of ALLOWED_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return true;
    }
  }
  return false;
}

function assertAllowedUpload(args: {
  fileName: string;
  sizeBytes: number;
}) {
  if (!hasAllowedExtension(args.fileName)) {
    throw new Error("Only .csv, .xls, and .xlsx files are allowed");
  }
  if (args.sizeBytes <= 0) {
    throw new Error("File is empty");
  }
  if (args.sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File is too large (${Math.round(args.sizeBytes / (1024 * 1024))} MB). Maximum is 15 MB.`,
    );
  }
}

function toListItem(doc: Doc<"assistantKnowledgeFiles">) {
  return {
    _id: doc._id,
    fileName: doc.fileName,
    contentType: doc.contentType,
    sizeBytes: doc.sizeBytes,
    status: doc.status,
    processingStage: doc.processingStage,
    processingProgress: doc.processingProgress,
    description: doc.description,
    languages: doc.languages,
    whenToUse: doc.whenToUse,
    howToSearch: doc.howToSearch,
    exampleQueries: doc.exampleQueries,
    toolDescription: doc.toolDescription,
    isActive: doc.isActive,
    errorMessage: doc.errorMessage,
    sheetCount: doc.sheetCount,
    rowCount: doc.rowCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function deactivateOtherActiveFiles(
  ctx: MutationCtx,
  exceptFileId: Id<"assistantKnowledgeFiles">,
) {
  const activeFiles = await ctx.db
    .query("assistantKnowledgeFiles")
    .withIndex("by_isActive", (q) => q.eq("isActive", true))
    .take(50);

  const now = Date.now();
  for (const file of activeFiles) {
    if (file._id === exceptFileId) {
      continue;
    }
    await ctx.db.patch(file._id, { isActive: false, updatedAt: now });
  }
}

export const generateKnowledgeFileUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx, { requireTech: true });
    return await ctx.storage.generateUploadUrl();
  },
});

export const createKnowledgeFile = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
  },
  returns: v.object({
    fileId: v.id("assistantKnowledgeFiles"),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Authentication required");
    }

    const fileName = args.fileName.trim();
    assertAllowedUpload({
      fileName,
      sizeBytes: args.sizeBytes,
    });

    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) {
      throw new Error("Uploaded file not found in storage");
    }

    const now = Date.now();
    const fileId = await ctx.db.insert("assistantKnowledgeFiles", {
      fileName,
      storageId: args.storageId,
      contentType: args.contentType || metadata.contentType || "application/octet-stream",
      sizeBytes: args.sizeBytes || metadata.size,
      status: "pending",
      processingStage: "queued",
      processingProgress: 0,
      isActive: false,
      uploadedBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.assistant.knowledgeFileProcessing.processKnowledgeFile,
      { fileId },
    );

    return { fileId };
  },
});

export const listKnowledgeFiles = query({
  args: {},
  returns: v.array(knowledgeFileListItemValidator),
  handler: async (ctx) => {
    await requireUser(ctx, { requireTech: true });

    const files = await ctx.db
      .query("assistantKnowledgeFiles")
      .withIndex("by_createdAt")
      .order("desc")
      .take(100);

    return files.map(toListItem);
  },
});

export const getKnowledgeFileSheets = query({
  args: {
    fileId: v.id("assistantKnowledgeFiles"),
  },
  returns: v.array(knowledgeSheetValidator),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      return [];
    }

    const sheets = await ctx.db
      .query("assistantKnowledgeSheets")
      .withIndex("by_fileId", (q) => q.eq("fileId", args.fileId))
      .take(100);

    return sheets
      .sort((a, b) => a.sheetIndex - b.sheetIndex)
      .map((sheet) => ({
        _id: sheet._id,
        fileId: sheet.fileId,
        name: sheet.name,
        headers: sheet.headers,
        purpose: sheet.purpose,
        searchMode: sheet.searchMode,
        languages: sheet.languages,
        keywords: sheet.keywords,
        searchHints: sheet.searchHints,
        rowCount: sheet.rowCount,
        sheetIndex: sheet.sheetIndex,
      }));
  },
});

export const setKnowledgeFileActive = mutation({
  args: {
    fileId: v.id("assistantKnowledgeFiles"),
    isActive: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new Error("File not found");
    }
    if (args.isActive && file.status !== "ready") {
      throw new Error("Only ready files can be set as active");
    }

    const now = Date.now();
    if (args.isActive) {
      await deactivateOtherActiveFiles(ctx, args.fileId);
    }

    await ctx.db.patch(args.fileId, {
      isActive: args.isActive,
      updatedAt: now,
    });

    return null;
  },
});

export const deleteKnowledgeFile = mutation({
  args: {
    fileId: v.id("assistantKnowledgeFiles"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new Error("File not found");
    }

    if (file.status === "processing" || file.status === "pending") {
      throw new Error("Cannot delete a file while it is still processing");
    }
    if (file.status === "deleting") {
      return null;
    }

    await ctx.db.patch(args.fileId, {
      isActive: false,
      status: "deleting",
      processingStage: undefined,
      errorMessage: undefined,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.assistant.knowledgeFiles.cleanupKnowledgeFile, {
      fileId: args.fileId,
      storageId: file.storageId,
    });

    return null;
  },
});

export const retryKnowledgeFileProcessing = mutation({
  args: {
    fileId: v.id("assistantKnowledgeFiles"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new Error("File not found");
    }
    if (file.status !== "failed") {
      throw new Error("Only failed files can be retried");
    }

    await ctx.db.patch(args.fileId, {
      status: "pending",
      processingStage: "queued",
      processingProgress: 0,
      errorMessage: undefined,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.assistant.knowledgeFileProcessing.processKnowledgeFile,
      { fileId: args.fileId },
    );

    return null;
  },
});

export const getKnowledgeFileInternal = internalQuery({
  args: {
    fileId: v.id("assistantKnowledgeFiles"),
  },
  returns: v.union(
    v.object({
      _id: v.id("assistantKnowledgeFiles"),
      storageId: v.id("_storage"),
      fileName: v.string(),
      status: fileStatusValidator,
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) {
      return null;
    }
    return {
      _id: file._id,
      storageId: file.storageId,
      fileName: file.fileName,
      status: file.status,
    };
  },
});

export const updateKnowledgeFileProgress = internalMutation({
  args: {
    fileId: v.id("assistantKnowledgeFiles"),
    status: fileStatusValidator,
    processingStage: v.optional(processingStageValidator),
    processingProgress: v.optional(v.number()),
    description: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    sheetCount: v.optional(v.number()),
    rowCount: v.optional(v.number()),
    clearError: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file || file.status === "deleting") {
      return null;
    }

    const patch: Partial<Doc<"assistantKnowledgeFiles">> = {
      status: args.status,
      updatedAt: Date.now(),
    };

    if (args.processingStage !== undefined) {
      patch.processingStage = args.processingStage;
    }
    if (args.processingProgress !== undefined) {
      patch.processingProgress = Math.max(0, Math.min(100, args.processingProgress));
    }
    if (args.description !== undefined) {
      patch.description = args.description;
    }
    if (args.sheetCount !== undefined) {
      patch.sheetCount = args.sheetCount;
    }
    if (args.rowCount !== undefined) {
      patch.rowCount = args.rowCount;
    }
    if (args.clearError) {
      patch.errorMessage = undefined;
    } else if (args.errorMessage !== undefined) {
      patch.errorMessage = args.errorMessage;
    }

    if (args.status === "ready" || args.status === "failed") {
      patch.processingStage = undefined;
      if (args.status === "ready") {
        patch.processingProgress = 100;
        patch.errorMessage = undefined;
      }
    }

    await ctx.db.patch(args.fileId, patch);
    return null;
  },
});

/** Deletes a batch of rows/sheets for a file. Call repeatedly until `done`. */
export const clearKnowledgeFileContents = internalMutation({
  args: {
    fileId: v.id("assistantKnowledgeFiles"),
  },
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("assistantKnowledgeRows")
      .withIndex("by_fileId", (q) => q.eq("fileId", args.fileId))
      .take(ROW_DELETE_BATCH_SIZE);

    if (rows.length > 0) {
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
      return { done: false };
    }

    const sheets = await ctx.db
      .query("assistantKnowledgeSheets")
      .withIndex("by_fileId", (q) => q.eq("fileId", args.fileId))
      .take(100);
    for (const sheet of sheets) {
      await ctx.db.delete(sheet._id);
    }

    return { done: true };
  },
});

export const createKnowledgeSheet = internalMutation({
  args: {
    fileId: v.id("assistantKnowledgeFiles"),
    name: v.string(),
    headers: v.array(v.string()),
    purpose: v.string(),
    searchMode: searchModeValidator,
    languages: v.array(v.string()),
    keywords: v.array(v.string()),
    searchHints: v.string(),
    rowCount: v.number(),
    sheetIndex: v.number(),
  },
  returns: v.id("assistantKnowledgeSheets"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("assistantKnowledgeSheets", {
      fileId: args.fileId,
      name: args.name,
      headers: args.headers,
      purpose: args.purpose,
      searchMode: args.searchMode,
      languages: args.languages,
      keywords: args.keywords,
      searchHints: args.searchHints,
      rowCount: args.rowCount,
      sheetIndex: args.sheetIndex,
      createdAt: Date.now(),
    });
  },
});

export const insertKnowledgeRowBatch = internalMutation({
  args: {
    fileId: v.id("assistantKnowledgeFiles"),
    sheetId: v.id("assistantKnowledgeSheets"),
    rows: v.array(parsedRowValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sheet = await ctx.db.get(args.sheetId);
    if (!sheet || sheet.fileId !== args.fileId) {
      return null;
    }

    const batch = args.rows.slice(0, ROW_INSERT_BATCH_SIZE);
    for (const row of batch) {
      await ctx.db.insert("assistantKnowledgeRows", {
        fileId: args.fileId,
        sheetId: args.sheetId,
        rowIndex: row.rowIndex,
        data: row.data,
        searchableText: row.searchableText,
        ...(row.embedding ? { embedding: row.embedding } : {}),
      });
    }

    return null;
  },
});

export const markKnowledgeFileReady = internalMutation({
  args: {
    fileId: v.id("assistantKnowledgeFiles"),
    description: v.string(),
    languages: v.array(v.string()),
    whenToUse: v.string(),
    howToSearch: v.string(),
    exampleQueries: v.array(v.string()),
    toolDescription: v.string(),
    sheetCount: v.number(),
    rowCount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file || file.status === "deleting") {
      return null;
    }

    await ctx.db.patch(args.fileId, {
      status: "ready",
      processingStage: undefined,
      processingProgress: 100,
      description: args.description,
      languages: args.languages,
      whenToUse: args.whenToUse,
      howToSearch: args.howToSearch,
      exampleQueries: args.exampleQueries,
      toolDescription: args.toolDescription,
      sheetCount: args.sheetCount,
      rowCount: args.rowCount,
      errorMessage: undefined,
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const cleanupKnowledgeFile = internalMutation({
  args: {
    fileId: v.id("assistantKnowledgeFiles"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("assistantKnowledgeRows")
      .withIndex("by_fileId", (q) => q.eq("fileId", args.fileId))
      .take(ROW_DELETE_BATCH_SIZE);

    if (rows.length > 0) {
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
      await ctx.scheduler.runAfter(0, internal.assistant.knowledgeFiles.cleanupKnowledgeFile, args);
      return null;
    }

    const sheets = await ctx.db
      .query("assistantKnowledgeSheets")
      .withIndex("by_fileId", (q) => q.eq("fileId", args.fileId))
      .take(100);
    for (const sheet of sheets) {
      await ctx.db.delete(sheet._id);
    }

    const file = await ctx.db.get(args.fileId);
    if (file) {
      await ctx.db.delete(args.fileId);
    }

    try {
      await ctx.storage.delete(args.storageId);
    } catch (error) {
      console.error("Failed to delete knowledge file storage blob:", error);
    }

    return null;
  },
});

type ActiveKnowledgeToolContext = {
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

/** Compose the runtime tool description from active-file search guidance. */
export function buildKnowledgeSearchToolDescription(
  context: ActiveKnowledgeToolContext,
  addon?: string,
): string {
  const sheetBlocks = context.sheets.map((sheet) => {
    const parts = [
      `- Sheet "${sheet.name}" (${sheet.searchMode}, ${sheet.rowCount} rows)`,
      `  Columns: ${sheet.headers.join(", ") || "(none)"}`,
    ];
    if (sheet.purpose) {
      parts.push(`  Purpose: ${sheet.purpose}`);
    }
    if (sheet.languages.length > 0) {
      parts.push(`  Languages: ${sheet.languages.join(", ")}`);
    }
    if (sheet.keywords.length > 0) {
      parts.push(`  Keywords: ${sheet.keywords.join(", ")}`);
    }
    if (sheet.searchHints) {
      parts.push(`  Search tips: ${sheet.searchHints}`);
    }
    return parts.join("\n");
  });

  const base =
    context.toolDescription.trim() ||
    [
      `Search the active knowledge workbook "${context.fileName}".`,
      context.description,
      context.whenToUse ? `When to use: ${context.whenToUse}` : "",
      context.howToSearch ? `How to search: ${context.howToSearch}` : "",
    ]
      .filter(Boolean)
      .join("\n");

  const sections = [
    base,
    context.languages.length > 0
      ? `Content languages: ${context.languages.join(", ")}. Prefer queries in those languages.`
      : "",
    context.exampleQueries.length > 0
      ? `Example queries:\n${context.exampleQueries.map((q) => `- ${q}`).join("\n")}`
      : "",
    sheetBlocks.length > 0 ? `Sheets:\n${sheetBlocks.join("\n")}` : "",
    'Always pass both queryEn and queryAr. Content may exist in only one language (e.g. Arabic-only FAQ), so bilingual search is required.',
  ].filter(Boolean);


  const composed = sections.join("\n\n");
  const trimmedAddon = addon?.trim();
  if (!trimmedAddon) {
    return composed;
  }
  return `${composed}\n\nAdditional guidance:\n${trimmedAddon}`;
}

export const getActiveKnowledgeToolContextInternal = internalQuery({
  args: {},
  returns: v.union(activeKnowledgeToolContextValidator, v.null()),
  handler: async (ctx): Promise<ActiveKnowledgeToolContext | null> => {
    const active = await ctx.db
      .query("assistantKnowledgeFiles")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .take(5);

    const file = active.find((item) => item.status === "ready") ?? null;
    if (!file) {
      return null;
    }

    const sheets = await ctx.db
      .query("assistantKnowledgeSheets")
      .withIndex("by_fileId", (q) => q.eq("fileId", file._id))
      .take(100);

    const sorted = sheets.sort((a, b) => a.sheetIndex - b.sheetIndex);

    return {
      fileId: file._id,
      fileName: file.fileName,
      description: file.description ?? "",
      languages: file.languages ?? [],
      whenToUse: file.whenToUse ?? "",
      howToSearch: file.howToSearch ?? "",
      exampleQueries: file.exampleQueries ?? [],
      toolDescription: file.toolDescription ?? "",
      sheets: sorted.map((sheet) => ({
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
    };
  },
});

export const searchKnowledgeTextInternal = internalQuery({
  args: {
    fileId: v.id("assistantKnowledgeFiles"),
    queries: v.array(v.string()),
    sheetId: v.optional(v.id("assistantKnowledgeSheets")),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      rowId: v.id("assistantKnowledgeRows"),
      sheetId: v.id("assistantKnowledgeSheets"),
      sheetName: v.string(),
      searchMode: searchModeValidator,
      rowIndex: v.number(),
      data: v.array(
        v.object({
          header: v.string(),
          value: v.string(),
        }),
      ),
      searchableText: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const searchTerms = [
      ...new Set(
        args.queries
          .map((query) => query.trim())
          .filter((query) => query.length > 0),
      ),
    ];
    if (searchTerms.length === 0) {
      return [];
    }

    const file = await ctx.db.get(args.fileId);
    if (!file || file.status !== "ready") {
      return [];
    }

    const sheets = await ctx.db
      .query("assistantKnowledgeSheets")
      .withIndex("by_fileId", (q) => q.eq("fileId", args.fileId))
      .take(100);
    const sheetById = new Map(sheets.map((sheet) => [sheet._id, sheet]));

    const limit = Math.min(Math.max(args.limit ?? 8, 1), 20);
    const perQueryLimit = Math.min(limit, 12);
    const seen = new Set<string>();
    const merged: Array<{
      rowId: Id<"assistantKnowledgeRows">;
      sheetId: Id<"assistantKnowledgeSheets">;
      sheetName: string;
      searchMode: "semantic" | "structured" | "hybrid";
      rowIndex: number;
      data: Array<{ header: string; value: string }>;
      searchableText: string;
    }> = [];

    for (const searchTerm of searchTerms) {
      if (merged.length >= limit) {
        break;
      }

      const rows = await ctx.db
        .query("assistantKnowledgeRows")
        .withSearchIndex("search_text", (searchQuery) => {
          let built = searchQuery.search("searchableText", searchTerm).eq("fileId", args.fileId);
          if (args.sheetId) {
            built = built.eq("sheetId", args.sheetId);
          }
          return built;
        })
        .take(perQueryLimit);

      for (const row of rows) {
        if (seen.has(row._id)) {
          continue;
        }
        const sheet = sheetById.get(row.sheetId);
        if (!sheet) {
          continue;
        }
        seen.add(row._id);
        merged.push({
          rowId: row._id,
          sheetId: row.sheetId,
          sheetName: sheet.name,
          searchMode: sheet.searchMode,
          rowIndex: row.rowIndex,
          data: row.data,
          searchableText: row.searchableText,
        });
        if (merged.length >= limit) {
          break;
        }
      }
    }

    return merged;
  },
});

export const resolveKnowledgeSearchTargetInternal = internalQuery({
  args: {
    sheetName: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      fileId: v.id("assistantKnowledgeFiles"),
      sheetId: v.optional(v.id("assistantKnowledgeSheets")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const active = await ctx.db
      .query("assistantKnowledgeFiles")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .take(5);
    const file = active.find((item) => item.status === "ready") ?? null;
    if (!file) {
      return null;
    }

    if (!args.sheetName?.trim()) {
      return { fileId: file._id };
    }

    const wanted = args.sheetName.trim().toLowerCase();
    const sheets = await ctx.db
      .query("assistantKnowledgeSheets")
      .withIndex("by_fileId", (q) => q.eq("fileId", file._id))
      .take(100);
    const match = sheets.find((sheet) => sheet.name.toLowerCase() === wanted);
    if (!match) {
      return null;
    }

    return { fileId: file._id, sheetId: match._id };
  },
});

export const getKnowledgeSearchRowsByIdsInternal = internalQuery({
  args: {
    rowIds: v.array(v.id("assistantKnowledgeRows")),
  },
  returns: v.array(
    v.object({
      rowId: v.id("assistantKnowledgeRows"),
      sheetId: v.id("assistantKnowledgeSheets"),
      sheetName: v.string(),
      searchMode: searchModeValidator,
      rowIndex: v.number(),
      data: v.array(
        v.object({
          header: v.string(),
          value: v.string(),
        }),
      ),
      searchableText: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const results: Array<{
      rowId: Id<"assistantKnowledgeRows">;
      sheetId: Id<"assistantKnowledgeSheets">;
      sheetName: string;
      searchMode: "semantic" | "structured" | "hybrid";
      rowIndex: number;
      data: Array<{ header: string; value: string }>;
      searchableText: string;
    }> = [];

    for (const rowId of args.rowIds) {
      const row = await ctx.db.get(rowId);
      if (!row) {
        continue;
      }
      const sheet = await ctx.db.get(row.sheetId);
      if (!sheet) {
        continue;
      }
      results.push({
        rowId: row._id,
        sheetId: row.sheetId,
        sheetName: sheet.name,
        searchMode: sheet.searchMode,
        rowIndex: row.rowIndex,
        data: row.data,
        searchableText: row.searchableText,
      });
    }

    return results;
  },
});

/** Admin preview search over a specific file. */
export const searchKnowledgeRows = query({
  args: {
    query: v.string(),
    fileId: v.optional(v.id("assistantKnowledgeFiles")),
    sheetId: v.optional(v.id("assistantKnowledgeSheets")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("assistantKnowledgeRows"),
        fileId: v.id("assistantKnowledgeFiles"),
        sheetId: v.id("assistantKnowledgeSheets"),
        rowIndex: v.number(),
        data: v.array(
          v.object({
            header: v.string(),
            value: v.string(),
          }),
        ),
        searchableText: v.string(),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });

    const q = args.query.trim();
    if (q.length === 0) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("assistantKnowledgeRows")
      .withSearchIndex("search_text", (searchQuery) => {
        let built = searchQuery.search("searchableText", q);
        if (args.fileId) {
          built = built.eq("fileId", args.fileId);
        }
        if (args.sheetId) {
          built = built.eq("sheetId", args.sheetId);
        }
        return built;
      })
      .paginate(args.paginationOpts);

    return {
      page: result.page.map((row) => ({
        _id: row._id,
        fileId: row.fileId,
        sheetId: row.sheetId,
        rowIndex: row.rowIndex,
        data: row.data,
        searchableText: row.searchableText,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
