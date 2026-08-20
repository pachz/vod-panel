import type { MessageDoc } from "@convex-dev/agent";

export type CtaInventoryItem = {
  text: string;
  url: string;
};

export type CtaInventory = {
  callToActions: CtaInventoryItem[];
  hasCoursesCatalog: boolean;
  hasWhatsAppSupport: boolean;
  /** Destinations owned by dedicated catalog/WhatsApp tools — generic CTAs must not duplicate these. */
  reservedUrls: string[];
};

export type CleanupDecisions = {
  keepCallToActionUrls: string[];
  keepCoursesCatalog: boolean;
  keepWhatsAppSupport: boolean;
};

export const ASSISTANT_CLEANUP_CTA_SYSTEM = `You decide which generic call-to-action buttons (from renderUiCards) to keep after an assistant reply.
Rules:
- Only decide keepCallToActionUrls from the inventory.callToActions list.
- Prefer fewer, clearer CTAs. Drop duplicates and near-duplicates.
- Never invent URLs. Only keep urls that appear in inventory.callToActions.
- Dedicated tools (showCoursesCatalog / sendWhatsAppSupport) are always kept by the system — do not try to drop them.
- Drop a generic CTA that points at the same destination as a dedicated catalog or WhatsApp tool (see reservedUrls).
- keepCoursesCatalog and keepWhatsAppSupport must mirror inventory.hasCoursesCatalog / hasWhatsAppSupport (always true when those flags are true).
- Output only the structured fields.`;

export const ASSISTANT_CLEANUP_STREAM_SYSTEM = `You rewrite an assistant reply for the end user.
Rules:
- Keep the same language as the draft.
- Preserve meaning and helpfulness. Do not invent facts, courses, prices, or URLs.
- Do not use markdown links. Do not include raw URLs.
- Do not mention buttons, CTAs, cards, tools, or that you are rewriting.
- Do not list course titles/descriptions when course cards are implied by the draft.
- Output only the final user-facing reply text. No preamble.`;

export const ASSISTANT_CLEANUP_CTA_USER_PROMPT_TEMPLATE = [
  "Draft assistant reply:",
  "{{draftText}}",
  "",
  "CTA inventory (JSON):",
  "{{inventoryJson}}",
  "",
  "Decide which CTAs to keep.",
].join("\n");

export const ASSISTANT_CLEANUP_STREAM_USER_PROMPT_TEMPLATE = [
  "Rewrite the following assistant draft into the final user-facing reply.",
  "",
  "{{draftText}}",
].join("\n");

export const ASSISTANT_CLEANUP_DEFAULT_CTA_TEMPERATURE = 0;

export type CleanupRuntimeSettings = {
  ctaSystemPrompt: string;
  streamSystemPrompt: string;
  ctaUserPromptTemplate: string;
  streamUserPromptTemplate: string;
  model: string;
  ctaTemperature: number;
};

export function resolveCleanupModelId(override?: string | null): string {
  const fromSettings = override?.trim();
  if (fromSettings) return fromSettings;
  return (
    process.env.OPENAI_CLEANUP_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}

export function resolveCleanupCtaTemperature(override?: number | null): number {
  if (typeof override === "number" && Number.isFinite(override)) {
    return Math.min(2, Math.max(0, override));
  }
  return ASSISTANT_CLEANUP_DEFAULT_CTA_TEMPERATURE;
}

function applyCleanupTemplate(
  template: string,
  vars: { draftText: string; inventoryJson?: string },
): string {
  return template
    .replaceAll("{{draftText}}", vars.draftText)
    .replaceAll("{{inventoryJson}}", vars.inventoryJson ?? "");
}

type ToolResultLike = {
  toolName: string;
  output: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function normalizeCleanupUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) {
    return trimmed.length > 1 && trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname;
    return parsed.toString().toLowerCase();
  } catch {
    return trimmed;
  }
}

function extractCallToActions(output: unknown): CtaInventoryItem[] {
  const record = asRecord(output);
  if (!record || !Array.isArray(record.callToActions)) return [];
  const items: CtaInventoryItem[] = [];
  for (const item of record.callToActions) {
    const cta = asRecord(item);
    if (!cta) continue;
    if (typeof cta.text !== "string" || typeof cta.url !== "string") continue;
    const text = cta.text.trim();
    const url = cta.url.trim();
    if (!text || !url) continue;
    items.push({ text, url });
  }
  return items;
}

/** Collect CTA inventory from Pass-1 tool results (in-memory). */
export function extractCtaInventory(toolResults: ToolResultLike[]): CtaInventory {
  const callToActions: CtaInventoryItem[] = [];
  const reservedUrls: string[] = [];
  let hasCoursesCatalog = false;
  let hasWhatsAppSupport = false;

  for (const result of toolResults) {
    if (result.toolName === "renderUiCards") {
      callToActions.push(...extractCallToActions(result.output));
    } else if (result.toolName === "showCoursesCatalog") {
      const record = asRecord(result.output);
      if (
        record &&
        typeof record.messageEn === "string" &&
        typeof record.urlEn === "string"
      ) {
        hasCoursesCatalog = true;
        if (typeof record.urlEn === "string" && record.urlEn.trim()) {
          reservedUrls.push(record.urlEn.trim());
        }
        if (typeof record.urlAr === "string" && record.urlAr.trim()) {
          reservedUrls.push(record.urlAr.trim());
        }
      }
    } else if (result.toolName === "sendWhatsAppSupport") {
      const record = asRecord(result.output);
      if (
        record &&
        typeof record.messageEn === "string" &&
        typeof record.url === "string"
      ) {
        hasWhatsAppSupport = true;
        if (record.url.trim()) {
          reservedUrls.push(record.url.trim());
        }
      }
    }
  }

  return { callToActions, hasCoursesCatalog, hasWhatsAppSupport, reservedUrls };
}

/** Pull tool results from AI SDK generateText steps. */
export function collectToolResultsFromSteps(steps: unknown): ToolResultLike[] {
  if (!Array.isArray(steps)) return [];
  const collected: ToolResultLike[] = [];
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const toolResults = (step as { toolResults?: unknown }).toolResults;
    if (!Array.isArray(toolResults)) continue;
    for (const toolResult of toolResults) {
      if (!toolResult || typeof toolResult !== "object") continue;
      const record = toolResult as {
        toolName?: unknown;
        output?: unknown;
        result?: unknown;
      };
      if (typeof record.toolName !== "string") continue;
      const output = record.output ?? record.result;
      if (output === undefined) continue;
      collected.push({ toolName: record.toolName, output });
    }
  }
  return collected;
}

/** Pull tool results from model messages (assistant tool-result parts + tool role). */
export function collectToolResultsFromMessages(messages: unknown): ToolResultLike[] {
  if (!Array.isArray(messages)) return [];
  const collected: ToolResultLike[] = [];

  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const msg = raw as { role?: unknown; content?: unknown };
    if (!Array.isArray(msg.content)) continue;

    for (const part of msg.content) {
      if (!part || typeof part !== "object") continue;
      const toolPart = part as {
        type?: unknown;
        toolName?: unknown;
        output?: unknown;
        result?: unknown;
      };
      if (toolPart.type !== "tool-result") continue;
      if (typeof toolPart.toolName !== "string") continue;
      const output = toolPart.output ?? toolPart.result;
      if (output === undefined) continue;
      collected.push({ toolName: toolPart.toolName, output });
    }
  }

  return collected;
}

export function mergeCtaInventories(...inventories: CtaInventory[]): CtaInventory {
  const callToActions: CtaInventoryItem[] = [];
  const reservedUrls: string[] = [];
  let hasCoursesCatalog = false;
  let hasWhatsAppSupport = false;
  const seenCta = new Set<string>();

  for (const inventory of inventories) {
    hasCoursesCatalog = hasCoursesCatalog || inventory.hasCoursesCatalog;
    hasWhatsAppSupport = hasWhatsAppSupport || inventory.hasWhatsAppSupport;
    for (const url of inventory.reservedUrls) {
      reservedUrls.push(url);
    }
    for (const cta of inventory.callToActions) {
      const key = `${normalizeCleanupUrl(cta.url)}|${cta.text}`;
      if (seenCta.has(key)) continue;
      seenCta.add(key);
      callToActions.push(cta);
    }
  }

  return { callToActions, hasCoursesCatalog, hasWhatsAppSupport, reservedUrls };
}

export function buildCleanupCtaPrompt(
  draftText: string,
  inventory: CtaInventory,
  template: string = ASSISTANT_CLEANUP_CTA_USER_PROMPT_TEMPLATE,
): string {
  return applyCleanupTemplate(template, {
    draftText: draftText.trim() || "(empty)",
    inventoryJson: JSON.stringify(inventory, null, 2),
  });
}

export function buildCleanupStreamPrompt(
  draftText: string,
  template: string = ASSISTANT_CLEANUP_STREAM_USER_PROMPT_TEMPLATE,
): string {
  return applyCleanupTemplate(template, {
    draftText: draftText.trim(),
  });
}

export function sanitizeCleanupDecisions(
  object: CleanupDecisions,
  inventory: CtaInventory,
): CleanupDecisions {
  const reserved = new Set(inventory.reservedUrls.map((url) => normalizeCleanupUrl(url)));
  const allowedUrls = new Set(
    inventory.callToActions.map((cta) => normalizeCleanupUrl(cta.url)),
  );
  const keepCallToActionUrls = object.keepCallToActionUrls
    .map((url) => url.trim())
    .filter(
      (url) =>
        url.length > 0 &&
        allowedUrls.has(normalizeCleanupUrl(url)) &&
        !reserved.has(normalizeCleanupUrl(url)),
    );

  const originalByNormalized = new Map(
    inventory.callToActions.map((cta) => [normalizeCleanupUrl(cta.url), cta.url]),
  );
  const resolvedUrls = [
    ...new Set(
      keepCallToActionUrls.map(
        (url) => originalByNormalized.get(normalizeCleanupUrl(url)) ?? url,
      ),
    ),
  ];

  return {
    keepCallToActionUrls: resolvedUrls,
    // Dedicated tools were intentionally invoked by Pass 1 — never drop them.
    keepCoursesCatalog: inventory.hasCoursesCatalog,
    keepWhatsAppSupport: inventory.hasWhatsAppSupport,
  };
}

export function emptyCleanupDecisions(inventory: CtaInventory): CleanupDecisions {
  const reserved = new Set(inventory.reservedUrls.map((url) => normalizeCleanupUrl(url)));
  return {
    keepCallToActionUrls: inventory.callToActions
      .map((cta) => cta.url)
      .filter((url) => !reserved.has(normalizeCleanupUrl(url))),
    keepCoursesCatalog: inventory.hasCoursesCatalog,
    keepWhatsAppSupport: inventory.hasWhatsAppSupport,
  };
}

export function applyDecisionsToToolOutput(
  toolName: string,
  output: unknown,
  decisions: CleanupDecisions,
): unknown {
  if (toolName === "renderUiCards") {
    const record = asRecord(output);
    if (!record) return output;
    const keep = new Set(
      decisions.keepCallToActionUrls.map((url) => normalizeCleanupUrl(url)),
    );
    const callToActions = extractCallToActions(output).filter((cta) =>
      keep.has(normalizeCleanupUrl(cta.url)),
    );
    return { ...record, callToActions };
  }

  // Dedicated catalog / WhatsApp tools are never suppressed by cleanup.
  if (toolName === "showCoursesCatalog" || toolName === "sendWhatsAppSupport") {
    const record = asRecord(output);
    if (!record) return output;
    if (record.suppressed === true) {
      return { ...record, suppressed: false };
    }
    return output;
  }

  return output;
}

/** Assistant messages that are prose-only (safe to delete before streaming cleaned text). */
export function findAssistantDraftTextMessageIds(savedMessages: MessageDoc[]): string[] {
  const ids: string[] = [];
  for (const doc of savedMessages) {
    const message = doc.message;
    if (!message || message.role !== "assistant") continue;
    if (typeof message.content === "string") {
      if (message.content.trim().length > 0) {
        ids.push(doc._id);
      }
      continue;
    }
    if (!Array.isArray(message.content)) continue;
    const hasToolCall = message.content.some(
      (part) => part && typeof part === "object" && part.type === "tool-call",
    );
    const hasToolResult = message.content.some(
      (part) => part && typeof part === "object" && part.type === "tool-result",
    );
    const hasText = message.content.some(
      (part) =>
        part &&
        typeof part === "object" &&
        part.type === "text" &&
        typeof (part as { text?: string }).text === "string" &&
        (part as { text: string }).text.trim().length > 0,
    );
    // Only delete when the message is prose-only (no tool parts to preserve).
    if (hasText && !hasToolCall && !hasToolResult) {
      ids.push(doc._id);
    }
  }
  return ids;
}

/**
 * Build patches that strip prose text from assistant messages that also carry tool parts.
 * Prevents draft text leaking when text and tool-calls share one message.
 */
export function stripTextFromMixedAssistantMessages(
  savedMessages: MessageDoc[],
): Array<{ messageId: string; message: NonNullable<MessageDoc["message"]> }> {
  const patches: Array<{ messageId: string; message: NonNullable<MessageDoc["message"]> }> =
    [];

  for (const doc of savedMessages) {
    const message = doc.message;
    if (!message || message.role !== "assistant") continue;
    if (!Array.isArray(message.content)) continue;

    const hasToolPart = message.content.some(
      (part) =>
        part &&
        typeof part === "object" &&
        (part.type === "tool-call" || part.type === "tool-result"),
    );
    if (!hasToolPart) continue;

    const hasText = message.content.some(
      (part) =>
        part &&
        typeof part === "object" &&
        part.type === "text" &&
        typeof (part as { text?: string }).text === "string" &&
        (part as { text: string }).text.trim().length > 0,
    );
    if (!hasText) continue;

    const nextContent = message.content.filter(
      (part) => !(part && typeof part === "object" && part.type === "text"),
    );
    patches.push({
      messageId: doc._id,
      message: { ...message, content: nextContent } as NonNullable<MessageDoc["message"]>,
    });
  }

  return patches;
}

type ModelMessageLike = {
  role: string;
  content: unknown;
};

/**
 * From Pass-1 generation, keep only tool-call / tool-result messages so draft prose
 * is never written to the thread for clients to observe.
 * Prefer `response.messages` (final cumulative list); fall back to last step.
 */
export function collectToolOnlyModelMessages(
  responseMessages: unknown,
  steps?: unknown,
): ModelMessageLike[] {
  let messages: unknown[] | null = null;
  if (Array.isArray(responseMessages)) {
    messages = responseMessages;
  } else if (Array.isArray(steps) && steps.length > 0) {
    const last = steps[steps.length - 1];
    if (last && typeof last === "object") {
      const lastMessages = (last as { response?: { messages?: unknown } }).response?.messages;
      if (Array.isArray(lastMessages)) {
        messages = lastMessages;
      }
    }
  }
  if (!messages) return [];

  const out: ModelMessageLike[] = [];
  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const msg = raw as ModelMessageLike;

    if (msg.role === "tool") {
      out.push(msg);
      continue;
    }

    if (msg.role !== "assistant") continue;

    if (typeof msg.content === "string") {
      // Pure draft prose — skip.
      continue;
    }
    if (!Array.isArray(msg.content)) continue;

    const toolParts = msg.content.filter(
      (part) =>
        part &&
        typeof part === "object" &&
        ((part as { type?: string }).type === "tool-call" ||
          (part as { type?: string }).type === "tool-result"),
    );
    if (toolParts.length === 0) continue;
    out.push({ role: "assistant", content: toolParts });
  }

  return out;
}

type ToolContentPart = {
  type: string;
  toolName?: string;
  toolCallId?: string;
  output?: unknown;
  result?: unknown;
  [key: string]: unknown;
};

export function patchToolResultMessages(
  savedMessages: MessageDoc[],
  decisions: CleanupDecisions,
): Array<{ messageId: string; message: NonNullable<MessageDoc["message"]> }> {
  const patches: Array<{ messageId: string; message: NonNullable<MessageDoc["message"]> }> =
    [];

  for (const doc of savedMessages) {
    const message = doc.message;
    if (!message) continue;

    if (message.role === "tool" && Array.isArray(message.content)) {
      let changed = false;
      const nextContent = message.content.map((part) => {
        if (!part || typeof part !== "object" || part.type !== "tool-result") {
          return part;
        }
        const toolPart = part as ToolContentPart;
        const toolName = typeof toolPart.toolName === "string" ? toolPart.toolName : "";
        if (
          toolName !== "renderUiCards" &&
          toolName !== "showCoursesCatalog" &&
          toolName !== "sendWhatsAppSupport"
        ) {
          return part;
        }
        const previousOutput = toolPart.output ?? toolPart.result;
        const nextOutput = applyDecisionsToToolOutput(toolName, previousOutput, decisions);
        if (nextOutput === previousOutput) return part;
        changed = true;
        return {
          ...toolPart,
          output: nextOutput,
          result: nextOutput,
        };
      });
      if (changed) {
        patches.push({
          messageId: doc._id,
          message: { ...message, content: nextContent } as NonNullable<MessageDoc["message"]>,
        });
      }
      continue;
    }

    if (message.role === "assistant" && Array.isArray(message.content)) {
      let changed = false;
      const nextContent = message.content.map((part) => {
        if (!part || typeof part !== "object" || part.type !== "tool-result") {
          return part;
        }
        const toolPart = part as ToolContentPart;
        const toolName = typeof toolPart.toolName === "string" ? toolPart.toolName : "";
        if (
          toolName !== "renderUiCards" &&
          toolName !== "showCoursesCatalog" &&
          toolName !== "sendWhatsAppSupport"
        ) {
          return part;
        }
        const previousOutput = toolPart.output ?? toolPart.result;
        const nextOutput = applyDecisionsToToolOutput(toolName, previousOutput, decisions);
        if (nextOutput === previousOutput) return part;
        changed = true;
        return {
          ...toolPart,
          output: nextOutput,
          result: nextOutput,
        };
      });
      if (changed) {
        patches.push({
          messageId: doc._id,
          message: { ...message, content: nextContent } as NonNullable<MessageDoc["message"]>,
        });
      }
    }
  }

  return patches;
}
