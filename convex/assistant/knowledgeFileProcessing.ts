"use node";

import { openai } from "@ai-sdk/openai";
import { embedMany, generateObject, generateText } from "ai";
import { v } from "convex/values";
import * as XLSX from "xlsx";
import { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";

const modelId = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const embeddingModelId = process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
const ROW_INSERT_BATCH_SIZE = 80;
const SEARCHABLE_TEXT_BATCH_SIZE = 25;
const SEARCHABLE_TEXT_CONCURRENCY = 3;
const EMBEDDING_BATCH_SIZE = 64;
const MAX_AI_INDEXED_ROWS = 2_000;
const MAX_SHEETS = 40;
const MAX_ROWS_PER_SHEET = 5_000;
const MAX_SAMPLE_ROWS_FOR_AI = 5;
const MAX_HEADERS = 64;
const MAX_SEARCHABLE_TEXT_LENGTH = 4_000;
const EMBEDDING_DIMENSIONS = 1536;

type SearchMode = "semantic" | "structured" | "hybrid";

type CellPair = { header: string; value: string };

type ParsedSheet = {
  name: string;
  headers: string[];
  rows: Array<{
    rowIndex: number;
    data: CellPair[];
    searchableText: string;
    embedding?: number[];
  }>;
};

type SheetMetaAi = {
  name: string;
  purpose: string;
  searchMode: SearchMode;
  languages: string[];
  keywords: string[];
  searchHints: string;
};

type FileMetaAi = {
  description: string;
  languages: string[];
  whenToUse: string;
  howToSearch: string;
  exampleQueries: string[];
  toolDescription: string;
  sheets: SheetMetaAi[];
};

function cellToString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return fixMojibake(value.trim());
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return fixMojibake(String(value).trim());
}

/**
 * Recover UTF-8 text that was incorrectly decoded as Latin-1/Windows-1252
 * (common with CSV exports). Leaves already-correct Arabic alone.
 */
function fixMojibake(text: string): string {
  if (!text || /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)) {
    return text;
  }
  // High Latin-1 bytes often appear when UTF-8 Arabic was mis-decoded.
  if (!/[\u00C0-\u00FF]/.test(text)) {
    return text;
  }

  try {
    const bytes = Uint8Array.from({ length: text.length }, (_, i) =>
      text.charCodeAt(i),
    );
    // Reject if any code unit is > 255 (shouldn't happen for Latin-1 mojibake).
    if (bytes.some((b, i) => text.charCodeAt(i) > 255)) {
      return text;
    }
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/[\u0600-\u06FF]/.test(decoded)) {
      return decoded;
    }
    return text;
  } catch {
    return text;
  }
}

function normalizeHeader(raw: unknown, index: number, used: Set<string>): string {
  let base = cellToString(raw);
  if (!base) {
    base = `Column ${index + 1}`;
  }

  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base} (${suffix})`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function buildSearchableText(data: CellPair[]): string {
  return data
    .filter((cell) => cell.value.length > 0)
    .map((cell) => `${cell.header}: ${cell.value}`)
    .join(" | ");
}

function clipSearchableText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_SEARCHABLE_TEXT_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_SEARCHABLE_TEXT_LENGTH - 1).trimEnd()}…`;
}

function composeBilingualSearchableText(
  en: string | undefined,
  ar: string | undefined,
  fallback: string,
): string {
  const parts = [en?.trim() ?? "", ar?.trim() ?? "", fallback.trim()].filter(
    (part) => part.length > 0,
  );
  // Prefer unique phrases while keeping order: EN, AR, raw fallback.
  const unique: string[] = [];
  for (const part of parts) {
    if (!unique.some((existing) => existing === part)) {
      unique.push(part);
    }
  }
  return clipSearchableText(unique.join("\n"));
}

const searchableBatchSchema = z.object({
  rows: z.array(
    z.object({
      i: z.number().int(),
      en: z.string(),
      ar: z.string(),
    }),
  ),
});

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const current = nextIndex;
        nextIndex += 1;
        if (current >= items.length) {
          return;
        }
        results[current] = await mapper(items[current]!, current);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

async function generateSearchableTextBatch(args: {
  sheetName: string;
  headers: string[];
  purpose?: string;
  rows: Array<{ rowIndex: number; data: CellPair[]; fallback: string }>;
}): Promise<Map<number, { en: string; ar: string }>> {
  const byIndex = new Map<number, { en: string; ar: string }>();
  if (args.rows.length === 0) {
    return byIndex;
  }

  const payload = args.rows.map((row) => ({
    i: row.rowIndex,
    cells: Object.fromEntries(row.data.map((cell) => [cell.header, cell.value])),
  }));

  try {
    const { object } = await generateObject({
      model: openai(modelId),
      schema: searchableBatchSchema,
      prompt: [
        "You create bilingual searchable text for spreadsheet knowledge-base rows.",
        "For each row, write concise English (en) and Arabic (ar) search text that would help find this row later.",
        "Include key facts, synonyms, and natural question phrasing when useful.",
        "Keep each language to about 1-3 short sentences or a dense keyword phrase.",
        "Preserve important proper nouns, plan names, emails, numbers, and IDs in both sides when relevant.",
        "Do not invent facts that are not present in the row.",
        "Return one entry per input row using the same i values.",
        "",
        `Sheet: ${args.sheetName}`,
        args.purpose ? `Purpose: ${args.purpose}` : "",
        `Headers: ${args.headers.join(", ")}`,
        "Rows:",
        JSON.stringify(payload),
      ]
        .filter(Boolean)
        .join("\n"),
    });

    for (const item of object.rows) {
      byIndex.set(item.i, { en: item.en, ar: item.ar });
    }
  } catch (error) {
    console.error("Searchable text batch failed:", error);
  }

  return byIndex;
}

async function embedSearchableTexts(texts: string[]): Promise<Array<number[] | undefined>> {
  const embeddings: Array<number[] | undefined> = new Array(texts.length).fill(undefined);
  if (texts.length === 0) {
    return embeddings;
  }

  for (let offset = 0; offset < texts.length; offset += EMBEDDING_BATCH_SIZE) {
    const slice = texts.slice(offset, offset + EMBEDDING_BATCH_SIZE);
    const nonEmptyIndexes: number[] = [];
    const values: string[] = [];

    for (let i = 0; i < slice.length; i++) {
      const text = slice[i]?.trim() ?? "";
      if (!text) {
        continue;
      }
      nonEmptyIndexes.push(offset + i);
      values.push(text.slice(0, 8_000));
    }

    if (values.length === 0) {
      continue;
    }

    try {
      const { embeddings: batchEmbeddings } = await embedMany({
        model: openai.embedding(embeddingModelId),
        values,
      });

      for (let i = 0; i < nonEmptyIndexes.length; i++) {
        const embedding = batchEmbeddings[i];
        if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
          continue;
        }
        embeddings[nonEmptyIndexes[i]!] = embedding;
      }
    } catch (error) {
      console.error("Embedding batch failed:", error);
    }
  }

  return embeddings;
}

type TextBatchJob = {
  sheetIndex: number;
  sheetName: string;
  headers: string[];
  purpose?: string;
  rows: Array<{ rowIndex: number; data: CellPair[]; fallback: string }>;
};

async function enrichSheetsWithSearchableText(
  sheets: ParsedSheet[],
  sheetMetas: SheetMetaAi[],
  onProgress?: (done: number, total: number) => Promise<void>,
): Promise<ParsedSheet[]> {
  const totalRows = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  const aiBudget = Math.min(totalRows, MAX_AI_INDEXED_ROWS);

  // Clone rows first with fallback searchable text.
  const working: ParsedSheet[] = sheets.map((sheet) => ({
    ...sheet,
    rows: sheet.rows.map((row) => ({ ...row })),
  }));

  const jobs: TextBatchJob[] = [];
  let scheduledAiRows = 0;

  for (let sheetIndex = 0; sheetIndex < working.length; sheetIndex++) {
    const sheet = working[sheetIndex]!;
    const meta = sheetMetas[sheetIndex];

    for (let offset = 0; offset < sheet.rows.length; offset += SEARCHABLE_TEXT_BATCH_SIZE) {
      if (scheduledAiRows >= aiBudget) {
        break;
      }
      const batch = sheet.rows.slice(offset, offset + SEARCHABLE_TEXT_BATCH_SIZE);
      const remaining = aiBudget - scheduledAiRows;
      const aiSlice = batch.slice(0, remaining);
      if (aiSlice.length === 0) {
        continue;
      }
      scheduledAiRows += aiSlice.length;
      jobs.push({
        sheetIndex,
        sheetName: sheet.name,
        headers: sheet.headers,
        purpose: meta?.purpose,
        rows: aiSlice.map((row) => ({
          rowIndex: row.rowIndex,
          data: row.data,
          fallback: row.searchableText,
        })),
      });
    }
  }

  let completedJobs = 0;
  await mapWithConcurrency(jobs, SEARCHABLE_TEXT_CONCURRENCY, async (job) => {
    const aiMap = await generateSearchableTextBatch(job);
    const sheet = working[job.sheetIndex]!;
    const byRowIndex = new Map(sheet.rows.map((row, index) => [row.rowIndex, index]));

    for (const source of job.rows) {
      const rowPos = byRowIndex.get(source.rowIndex);
      if (rowPos === undefined) {
        continue;
      }
      const generated = aiMap.get(source.rowIndex);
      sheet.rows[rowPos] = {
        ...sheet.rows[rowPos]!,
        searchableText: composeBilingualSearchableText(
          generated?.en,
          generated?.ar,
          source.fallback,
        ),
      };
    }

    completedJobs += 1;
    if (onProgress) {
      // Text phase is first 70% of indexing progress units from caller.
      const approxRows = Math.round((scheduledAiRows * completedJobs) / Math.max(jobs.length, 1));
      await onProgress(approxRows, Math.max(totalRows, 1));
    }
  });

  // Embed all rows' searchable text in third-party batches.
  const flatRows: Array<{ sheetIndex: number; rowPos: number; text: string }> = [];
  for (let sheetIndex = 0; sheetIndex < working.length; sheetIndex++) {
    const sheet = working[sheetIndex]!;
    for (let rowPos = 0; rowPos < sheet.rows.length; rowPos++) {
      flatRows.push({
        sheetIndex,
        rowPos,
        text: sheet.rows[rowPos]!.searchableText,
      });
    }
  }

  const embeddings = await embedSearchableTexts(flatRows.map((row) => row.text));
  for (let i = 0; i < flatRows.length; i++) {
    const target = flatRows[i]!;
    const embedding = embeddings[i];
    if (!embedding) {
      continue;
    }
    working[target.sheetIndex]!.rows[target.rowPos] = {
      ...working[target.sheetIndex]!.rows[target.rowPos]!,
      embedding,
    };
  }

  if (onProgress) {
    await onProgress(totalRows, Math.max(totalRows, 1));
  }

  return working;
}

function parseWorkbook(buffer: ArrayBuffer, fileName: string): ParsedSheet[] {
  // codepage 65001 = UTF-8 (important for Arabic CSV; harmless for xlsx).
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    dense: false,
    codepage: 65001,
  });

  const sheetNames = workbook.SheetNames.slice(0, MAX_SHEETS);
  if (sheetNames.length === 0) {
    throw new Error("No sheets found in the file");
  }

  const sheets: ParsedSheet[] = [];

  for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      continue;
    }

    const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(
      worksheet,
      {
        header: 1,
        defval: "",
        blankrows: false,
        raw: false,
      },
    );

    if (matrix.length === 0) {
      continue;
    }

    const headerRow = matrix[0] ?? [];
    const usedHeaders = new Set<string>();
    const headerCount = Math.min(Math.max(headerRow.length, 1), MAX_HEADERS);
    const headers: string[] = [];
    for (let i = 0; i < headerCount; i++) {
      headers.push(normalizeHeader(headerRow[i], i, usedHeaders));
    }

    const dataRows = matrix.slice(1, 1 + MAX_ROWS_PER_SHEET);
    const rows: ParsedSheet["rows"] = [];

    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
      const rawRow = dataRows[rowIndex] ?? [];
      const data: CellPair[] = [];
      let hasValue = false;

      for (let col = 0; col < headers.length; col++) {
        const header = headers[col]!;
        const value = cellToString(rawRow[col]);
        data.push({ header, value });
        if (value) {
          hasValue = true;
        }
      }

      if (!hasValue) {
        continue;
      }

      const searchableText = buildSearchableText(data);
      if (!searchableText) {
        continue;
      }

      rows.push({
        rowIndex,
        data,
        searchableText,
      });
    }

    sheets.push({
      name: fixMojibake(sheetName.trim()) || `Sheet ${sheets.length + 1}`,
      headers,
      rows,
    });
  }

  if (sheets.length === 0) {
    throw new Error(`Could not parse any sheets from ${fileName}`);
  }

  return sheets;
}

const KNOWLEDGE_LANGUAGES = ["en", "ar"] as const;
type KnowledgeLanguage = (typeof KNOWLEDGE_LANGUAGES)[number];

function detectLanguagesFromText(text: string): KnowledgeLanguage[] {
  const languages: KnowledgeLanguage[] = [];
  if (/[\u0600-\u06FF]/.test(text)) {
    languages.push("ar");
  }
  if (/[A-Za-z]/.test(text)) {
    languages.push("en");
  }
  return [...new Set(languages)];
}

function normalizeKnowledgeLanguages(value: unknown, fallback: string[]): KnowledgeLanguage[] {
  const source = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : fallback;
  const normalized = source
    .map((item) => item.trim().toLowerCase())
    .flatMap((item): KnowledgeLanguage[] => {
      if (item === "en" || item.startsWith("en-")) return ["en"];
      if (item === "ar" || item.startsWith("ar-") || item === "arabic") return ["ar"];
      // Map Persian/other Arabic-script labels to Arabic for this product.
      if (item === "fa" || item.startsWith("fa-") || item === "farsi" || item === "persian") {
        return ["ar"];
      }
      return [];
    });
  const unique = [...new Set(normalized)];
  if (unique.length > 0) {
    return unique;
  }
  const detected = detectLanguagesFromText(fallback.join(" "));
  return detected.length > 0 ? detected : ["en"];
}

function fallbackSheetMeta(sheet: ParsedSheet): SheetMetaAi {
  const nameLower = sheet.name.toLowerCase();
  let searchMode: SearchMode = "hybrid";
  if (
    nameLower.includes("faq") ||
    nameLower.includes("question") ||
    sheet.headers.some((h) =>
      /question|answer|faq|\u0633\u0624\u0627\u0644|\u0633\u0648\u0627\u0644|\u062C\u0648\u0627\u0628/i.test(
        h,
      ),
    )
  ) {
    searchMode = "semantic";
  } else if (
    sheet.headers.some((h) =>
      /price|plan|id|email|phone|amount|duration|\u0633\u0639\u0631|\u062E\u0637\u0629|\u0628\u0631\u064A\u062F/i.test(
        h,
      ),
    )
  ) {
    searchMode = "structured";
  }

  const sampleText = [
    sheet.name,
    ...sheet.headers,
    ...sheet.rows.slice(0, 8).flatMap((row) => row.data.map((cell) => cell.value)),
  ].join(" ");

  return {
    name: sheet.name,
    purpose: `Data from sheet "${sheet.name}"`,
    searchMode,
    languages: detectLanguagesFromText(sampleText),
    keywords: sheet.headers.slice(0, 8),
    searchHints:
      searchMode === "structured"
        ? "Search with exact field values (plan names, prices, emails)."
        : "Search with natural-language phrases matching question/answer text.",
  };
}

function fallbackFileMeta(fileName: string, sheets: ParsedSheet[]): FileMetaAi {
  const sheetMeta = sheets.map(fallbackSheetMeta);
  const languages = [...new Set(sheetMeta.flatMap((sheet) => sheet.languages))];
  const description = `Knowledge workbook "${fileName}" with ${sheets.length} sheet${sheets.length === 1 ? "" : "s"}.`;
  const whenToUse =
    "Use when the user asks about information stored in this knowledge workbook (FAQ, plans, contacts, policies, etc.).";
  const howToSearch =
    "Always search with both English (queryEn) and Arabic (queryAr) variants. Content may be Arabic-only or English-only—bilingual queries are required.";
  const exampleQueries = sheetMeta
    .flatMap((sheet) => sheet.keywords.slice(0, 2))
    .filter(Boolean)
    .slice(0, 5);
  const toolDescription = [
    `Search the active support knowledge workbook "${fileName}".`,
    description,
    whenToUse,
    howToSearch,
  ].join(" ");

  return {
    description,
    languages,
    whenToUse,
    howToSearch,
    exampleQueries:
      exampleQueries.length > 0 ? exampleQueries : ["subscription price", "working hours"],
    toolDescription,
    sheets: sheetMeta,
  };
}

function parseAiJson(text: string): {
  description?: string;
  languages?: string[];
  whenToUse?: string;
  howToSearch?: string;
  exampleQueries?: string[];
  toolDescription?: string;
  sheets?: Array<{
    name?: string;
    purpose?: string;
    searchMode?: string;
    languages?: string[];
    keywords?: string[];
    searchHints?: string;
  }>;
} | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate) as {
      description?: string;
      languages?: string[];
      whenToUse?: string;
      howToSearch?: string;
      exampleQueries?: string[];
      toolDescription?: string;
      sheets?: Array<{
        name?: string;
        purpose?: string;
        searchMode?: string;
        languages?: string[];
        keywords?: string[];
        searchHints?: string;
      }>;
    };
  } catch {
    return null;
  }
}

function coerceSearchMode(value: string | undefined, fallback: SearchMode): SearchMode {
  if (value === "semantic" || value === "structured" || value === "hybrid") {
    return value;
  }
  return fallback;
}

function normalizeStringList(value: unknown, fallback: string[], max = 12): string[] {
  if (!Array.isArray(value)) {
    return fallback.slice(0, max);
  }
  const cleaned = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return (cleaned.length > 0 ? cleaned : fallback).slice(0, max);
}

async function describeWithAi(fileName: string, sheets: ParsedSheet[]): Promise<FileMetaAi> {
  const fallback = fallbackFileMeta(fileName, sheets);

  const summary = sheets.map((sheet) => ({
    name: sheet.name,
    headers: sheet.headers,
    rowCount: sheet.rows.length,
    sampleRows: sheet.rows.slice(0, MAX_SAMPLE_ROWS_FOR_AI).map((row) =>
      Object.fromEntries(row.data.map((cell) => [cell.header, cell.value])),
    ),
  }));

  try {
    const { text } = await generateText({
      model: openai(modelId),
      prompt: [
        "You are preparing spreadsheet knowledge for a customer-support AI assistant tool.",
        "Analyze languages, how the assistant should search later, and write the tool description.",
        "Return JSON only (no markdown) with this shape:",
        "{",
        '  "description": "1-2 sentences about the whole file",',
        '  "languages": ["en"|"ar"],',
        '  "whenToUse": "when the assistant should call this knowledge search tool",',
        '  "howToSearch": "always search with both English and Arabic query variants; which columns/keywords matter",',
        '  "exampleQueries": ["3-6 realistic search queries; include English and Arabic pairs when useful"],',
        '  "toolDescription": "A full tool description for the LLM: what this KB contains, when to use it, that callers must pass both English and Arabic queries, languages, and caveats. 4-8 sentences.",',
        '  "sheets": [',
        "    {",
        '      "name": "<exact sheet name>",',
        '      "purpose": "short purpose",',
        '      "searchMode": "semantic"|"structured"|"hybrid",',
        '      "languages": ["en"|"ar"],',
        '      "keywords": ["important terms/entities from this sheet"],',
        '      "searchHints": "sheet-specific search tips"',
        "    }",
        "  ]",
        "}",
        "",
        "searchMode guidance:",
        '- "semantic": FAQ / prose Q&A / free-text help content',
        '- "structured": plans, prices, IDs, tables looked up by exact fields',
        '- "hybrid": mix of both',
        "",
        "Language codes: only use \"en\" and/or \"ar\". Do not use fa/farsi/persian or any other language codes.",
        "If content is Arabic-script, label it as ar.",
        "Write toolDescription and exampleQueries in English and/or Arabic to match the workbook.",
        "",
        `File name: ${fileName}`,
        "Sheets:",
        JSON.stringify(summary, null, 2),
      ].join("\n"),
      maxOutputTokens: 1400,
    });

    const parsed = parseAiJson(text);
    if (!parsed) {
      return fallback;
    }

    const byName = new Map(
      (parsed.sheets ?? []).map((sheet) => [sheet.name?.trim() ?? "", sheet]),
    );

    const sheetMeta = sheets.map((sheet, index) => {
      const ai = byName.get(sheet.name) ?? parsed.sheets?.[index];
      const sheetFallback = fallback.sheets[index]!;
      return {
        name: sheet.name,
        purpose: (ai?.purpose ?? sheetFallback.purpose).trim() || sheetFallback.purpose,
        searchMode: coerceSearchMode(ai?.searchMode, sheetFallback.searchMode),
        languages: normalizeKnowledgeLanguages(ai?.languages, sheetFallback.languages),
        keywords: normalizeStringList(ai?.keywords, sheetFallback.keywords, 16),
        searchHints:
          (ai?.searchHints ?? sheetFallback.searchHints).trim() || sheetFallback.searchHints,
      };
    });

    const languages = normalizeKnowledgeLanguages(
      parsed.languages,
      [...new Set(sheetMeta.flatMap((sheet) => sheet.languages))],
    );

    return {
      description: (parsed.description ?? fallback.description).trim() || fallback.description,
      languages,
      whenToUse: (parsed.whenToUse ?? fallback.whenToUse).trim() || fallback.whenToUse,
      howToSearch: (parsed.howToSearch ?? fallback.howToSearch).trim() || fallback.howToSearch,
      exampleQueries: normalizeStringList(
        parsed.exampleQueries,
        fallback.exampleQueries,
        8,
      ),
      toolDescription:
        (parsed.toolDescription ?? fallback.toolDescription).trim() || fallback.toolDescription,
      sheets: sheetMeta,
    };
  } catch (error) {
    console.error("Knowledge file AI description failed:", error);
    return fallback;
  }
}

export const processKnowledgeFile = internalAction({
  args: {
    fileId: v.id("assistantKnowledgeFiles"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.runQuery(internal.assistant.knowledgeFiles.getKnowledgeFileInternal, {
      fileId: args.fileId,
    });

    if (!file || file.status === "deleting") {
      return null;
    }

    const setProgress = async (patch: {
      status: "processing" | "failed";
      processingStage?: "parsing" | "describing" | "indexing" | "saving";
      processingProgress?: number;
      errorMessage?: string;
      clearError?: boolean;
    }) => {
      await ctx.runMutation(internal.assistant.knowledgeFiles.updateKnowledgeFileProgress, {
        fileId: args.fileId,
        ...patch,
      });
    };

    try {
      await setProgress({
        status: "processing",
        processingStage: "parsing",
        processingProgress: 5,
        clearError: true,
      });

      const blob = await ctx.storage.get(file.storageId);
      if (!blob) {
        throw new Error("Stored file blob is missing");
      }

      const buffer = await blob.arrayBuffer();
      let sheets = parseWorkbook(buffer, file.fileName);

      await setProgress({
        status: "processing",
        processingStage: "describing",
        processingProgress: 25,
      });

      const ai = await describeWithAi(file.fileName, sheets);

      await setProgress({
        status: "processing",
        processingStage: "indexing",
        processingProgress: 35,
      });

      sheets = await enrichSheetsWithSearchableText(
        sheets,
        ai.sheets,
        async (done, total) => {
          const progress = 35 + Math.round((35 * done) / Math.max(total, 1));
          await setProgress({
            status: "processing",
            processingStage: "indexing",
            processingProgress: Math.min(69, progress),
          });
        },
      );

      await setProgress({
        status: "processing",
        processingStage: "saving",
        processingProgress: 70,
      });

      for (let clearGuard = 0; clearGuard < 500; clearGuard++) {
        const cleared = await ctx.runMutation(
          internal.assistant.knowledgeFiles.clearKnowledgeFileContents,
          { fileId: args.fileId },
        );
        if (cleared.done) {
          break;
        }
      }

      const totalRows = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
      let savedRows = 0;

      for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
        const sheet = sheets[sheetIndex]!;
        const meta = ai.sheets[sheetIndex] ?? fallbackSheetMeta(sheet);

        const sheetId: Id<"assistantKnowledgeSheets"> = await ctx.runMutation(
          internal.assistant.knowledgeFiles.createKnowledgeSheet,
          {
            fileId: args.fileId,
            name: sheet.name,
            headers: sheet.headers,
            purpose: meta.purpose,
            searchMode: meta.searchMode,
            languages: meta.languages,
            keywords: meta.keywords,
            searchHints: meta.searchHints,
            rowCount: sheet.rows.length,
            sheetIndex,
          },
        );

        for (let offset = 0; offset < sheet.rows.length; offset += ROW_INSERT_BATCH_SIZE) {
          const batch = sheet.rows.slice(offset, offset + ROW_INSERT_BATCH_SIZE);
          await ctx.runMutation(internal.assistant.knowledgeFiles.insertKnowledgeRowBatch, {
            fileId: args.fileId,
            sheetId,
            rows: batch,
          });

          savedRows += batch.length;
          const progress =
            70 + Math.round((25 * savedRows) / Math.max(totalRows, 1));
          await setProgress({
            status: "processing",
            processingStage: "saving",
            processingProgress: Math.min(95, progress),
          });
        }
      }

      await ctx.runMutation(internal.assistant.knowledgeFiles.markKnowledgeFileReady, {
        fileId: args.fileId,
        description: ai.description,
        languages: ai.languages,
        whenToUse: ai.whenToUse,
        howToSearch: ai.howToSearch,
        exampleQueries: ai.exampleQueries,
        toolDescription: ai.toolDescription,
        sheetCount: sheets.length,
        rowCount: totalRows,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to process knowledge file";
      console.error("processKnowledgeFile failed:", error);
      await setProgress({
        status: "failed",
        errorMessage: message,
        processingProgress: 0,
      });
    }

    return null;
  },
});

const knowledgeHybridResultValidator = v.object({
  sheetId: v.id("assistantKnowledgeSheets"),
  sheetName: v.string(),
  searchMode: v.union(
    v.literal("semantic"),
    v.literal("structured"),
    v.literal("hybrid"),
  ),
  rowIndex: v.number(),
  data: v.array(
    v.object({
      header: v.string(),
      value: v.string(),
    }),
  ),
  searchableText: v.string(),
  matchSource: v.union(v.literal("text"), v.literal("vector"), v.literal("both")),
  score: v.optional(v.number()),
});

export const searchKnowledgeBaseHybrid = internalAction({
  args: {
    queries: v.array(v.string()),
    sheetName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(knowledgeHybridResultValidator),
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

    const target = await ctx.runQuery(
      internal.assistant.knowledgeFiles.resolveKnowledgeSearchTargetInternal,
      { sheetName: args.sheetName },
    );
    if (!target) {
      return [];
    }

    const limit = Math.min(Math.max(args.limit ?? 8, 1), 20);

    const textHits = await ctx.runQuery(
      internal.assistant.knowledgeFiles.searchKnowledgeTextInternal,
      {
        fileId: target.fileId,
        queries: searchTerms,
        sheetId: target.sheetId,
        limit,
      },
    );

    const vectorScores = new Map<string, number>();
    try {
      const { embeddings } = await embedMany({
        model: openai.embedding(embeddingModelId),
        values: searchTerms.map((term) => term.slice(0, 8_000)),
      });

      for (const embedding of embeddings) {
        if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
          continue;
        }

        const vectorHits = await ctx.vectorSearch("assistantKnowledgeRows", "by_embedding", {
          vector: embedding,
          limit: Math.min(limit * 2, 32),
          filter: target.sheetId
            ? (q) => q.eq("sheetId", target.sheetId!)
            : (q) => q.eq("fileId", target.fileId),
        });

        for (const hit of vectorHits) {
          const previous = vectorScores.get(hit._id) ?? -Infinity;
          if (hit._score > previous) {
            vectorScores.set(hit._id, hit._score);
          }
        }
      }
    } catch (error) {
      console.error("Knowledge vector search failed:", error);
    }

    const textIds = new Set(textHits.map((hit) => hit.rowId));
    const missingVectorIds = [...vectorScores.keys()].filter((id) => !textIds.has(id as Id<"assistantKnowledgeRows">));

    const vectorOnlyRows =
      missingVectorIds.length > 0
        ? await ctx.runQuery(internal.assistant.knowledgeFiles.getKnowledgeSearchRowsByIdsInternal, {
            rowIds: missingVectorIds as Array<Id<"assistantKnowledgeRows">>,
          })
        : [];

    type Ranked = {
      sheetId: Id<"assistantKnowledgeSheets">;
      sheetName: string;
      searchMode: "semantic" | "structured" | "hybrid";
      rowIndex: number;
      data: Array<{ header: string; value: string }>;
      searchableText: string;
      matchSource: "text" | "vector" | "both";
      score?: number;
      rank: number;
    };

    const ranked: Ranked[] = [];

    for (const hit of textHits) {
      const score = vectorScores.get(hit.rowId);
      ranked.push({
        sheetId: hit.sheetId,
        sheetName: hit.sheetName,
        searchMode: hit.searchMode,
        rowIndex: hit.rowIndex,
        data: hit.data,
        searchableText: hit.searchableText,
        matchSource: score === undefined ? "text" : "both",
        score,
        // Prefer rows found by both, then text, using vector score as tie-breaker.
        rank: score === undefined ? 2 : 1 - score,
      });
    }

    for (const hit of vectorOnlyRows) {
      const score = vectorScores.get(hit.rowId) ?? 0;
      ranked.push({
        sheetId: hit.sheetId,
        sheetName: hit.sheetName,
        searchMode: hit.searchMode,
        rowIndex: hit.rowIndex,
        data: hit.data,
        searchableText: hit.searchableText,
        matchSource: "vector",
        score,
        rank: 3 - score,
      });
    }

    ranked.sort((a, b) => a.rank - b.rank);

    return ranked.slice(0, limit).map(({ rank: _rank, ...rest }) => rest);
  },
});
