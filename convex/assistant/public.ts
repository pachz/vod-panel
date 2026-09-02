import { createThread, getThreadMetadata, listUIMessages } from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { mutation, query } from "../_generated/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import {
  buildThreadSummary,
  parsePublicSessionId,
  publicThreadUserId,
} from "./audience";
import { rehamDivaAgent } from "./agent";
import {
  PUBLIC_ASSISTANT_GREETING_DEFAULTS,
  assistantGreetingPublicValidator,
  resolveAssistantGreeting,
} from "./greeting";
import { getSettingsDoc } from "./settings";
import { assistantLanguageValidator } from "./validators";
import { countUserThreadMessages } from "./auth";

const MAX_PUBLIC_PROMPT_LENGTH = 2_000;
const MAX_PUBLIC_USER_MESSAGES = 40;
const MAX_PUBLIC_MESSAGES_PER_WINDOW = 12;
const PUBLIC_RATE_WINDOW_MS = 10 * 60 * 1_000;
const MAX_LISTED_MESSAGES = 80;

const publicCtaValidator = v.object({
  text: v.string(),
  url: v.string(),
});

const publicCourseCardValidator = v.object({
  id: v.string(),
  slug: v.string(),
  title: v.string(),
  description: v.string(),
  imageUrl: v.optional(v.string()),
  category: v.optional(v.string()),
  durationMinutes: v.optional(v.number()),
});

const publicPlanCardValidator = v.object({
  id: v.string(),
  nameEn: v.string(),
  nameAr: v.string(),
  priceAmount: v.number(),
  priceCurrency: v.string(),
  billingInterval: v.union(v.literal("month"), v.literal("year")),
  featureTitles: v.array(v.string()),
});

const publicCatalogValidator = v.object({
  messageEn: v.string(),
  messageAr: v.string(),
  buttonTextEn: v.string(),
  buttonTextAr: v.string(),
  urlEn: v.string(),
  urlAr: v.string(),
});

const publicWhatsAppValidator = v.object({
  messageEn: v.string(),
  messageAr: v.string(),
  buttonTextEn: v.string(),
  buttonTextAr: v.string(),
  url: v.string(),
});

const publicChatMessageValidator = v.object({
  id: v.string(),
  role: v.union(v.literal("user"), v.literal("assistant")),
  text: v.string(),
  status: v.optional(v.string()),
  courses: v.array(publicCourseCardValidator),
  plans: v.array(publicPlanCardValidator),
  callToActions: v.array(publicCtaValidator),
  coursesCatalog: v.union(publicCatalogValidator, v.null()),
  whatsAppSupport: v.union(publicWhatsAppValidator, v.null()),
});

async function requirePublicEnabled(ctx: QueryCtx | MutationCtx) {
  const settings = await getSettingsDoc(ctx, "public");
  if (settings?.publicEnabled !== true) {
    throw new Error("Public assistant is not enabled");
  }
  return settings;
}

async function authorizePublicThread(
  ctx: QueryCtx | MutationCtx,
  threadId: string,
  sessionId: string,
) {
  const parsedSessionId = parsePublicSessionId(sessionId);
  const expectedUserId = publicThreadUserId(parsedSessionId);
  const metadata = await getThreadMetadata(ctx, components.agent, { threadId });
  if (metadata.userId !== expectedUserId) {
    throw new Error("Unauthorized");
  }
  return { sessionId: parsedSessionId, userId: expectedUserId };
}

function getToolPartMeta(part: unknown): { toolName: string; output: unknown } | null {
  if (!part || typeof part !== "object") {
    return null;
  }
  const record = part as Record<string, unknown>;
  const toolName =
    (typeof record.toolName === "string" && record.toolName) ||
    (typeof record.type === "string" && record.type.startsWith("tool-")
      ? record.type.replace(/^tool-/, "")
      : null);
  const output =
    record.output ??
    record.result ??
    (record.state === "output-available" ? record.output : undefined);
  if (!toolName || output === undefined) {
    return null;
  }
  return { toolName, output };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function serializePublicMessage(message: {
  key?: string;
  id?: string;
  role: string;
  text?: string;
  status?: string;
  parts?: unknown[];
}) {
  const courses: Array<{
    id: string;
    slug: string;
    title: string;
    description: string;
    imageUrl?: string;
    category?: string;
    durationMinutes?: number;
  }> = [];
  const plans: Array<{
    id: string;
    nameEn: string;
    nameAr: string;
    priceAmount: number;
    priceCurrency: string;
    billingInterval: "month" | "year";
    featureTitles: string[];
  }> = [];
  const callToActions: Array<{ text: string; url: string }> = [];
  let coursesCatalog: {
    messageEn: string;
    messageAr: string;
    buttonTextEn: string;
    buttonTextAr: string;
    urlEn: string;
    urlAr: string;
  } | null = null;
  let whatsAppSupport: {
    messageEn: string;
    messageAr: string;
    buttonTextEn: string;
    buttonTextAr: string;
    url: string;
  } | null = null;

  if (message.role !== "user") {
    for (const part of message.parts ?? []) {
      const meta = getToolPartMeta(part);
      if (!meta) {
        continue;
      }
      const output = asRecord(meta.output);
      if (!output) {
        continue;
      }
      if (meta.toolName === "renderUiCards") {
        if (Array.isArray(output.courses)) {
          for (const course of output.courses) {
            const row = asRecord(course);
            if (!row || typeof row.id !== "string") {
              continue;
            }
            courses.push({
              id: row.id,
              slug: typeof row.slug === "string" ? row.slug : row.id,
              title: typeof row.title === "string" ? row.title : "",
              description: typeof row.description === "string" ? row.description : "",
              imageUrl: typeof row.imageUrl === "string" ? row.imageUrl : undefined,
              category: typeof row.category === "string" ? row.category : undefined,
              durationMinutes:
                typeof row.durationMinutes === "number" ? row.durationMinutes : undefined,
            });
          }
        }
        if (Array.isArray(output.plans)) {
          for (const plan of output.plans) {
            const row = asRecord(plan);
            if (!row || typeof row.id !== "string") {
              continue;
            }
            const billingInterval =
              row.billingInterval === "year" || row.billingInterval === "month"
                ? row.billingInterval
                : "month";
            const featureTitles = Array.isArray(row.featureTitlesEn)
              ? row.featureTitlesEn.filter((item): item is string => typeof item === "string")
              : [];
            plans.push({
              id: row.id,
              nameEn: typeof row.nameEn === "string" ? row.nameEn : "",
              nameAr: typeof row.nameAr === "string" ? row.nameAr : "",
              priceAmount: typeof row.priceAmount === "number" ? row.priceAmount : 0,
              priceCurrency: typeof row.priceCurrency === "string" ? row.priceCurrency : "KWD",
              billingInterval,
              featureTitles,
            });
          }
        }
        if (Array.isArray(output.callToActions)) {
          for (const cta of output.callToActions) {
            const row = asRecord(cta);
            if (
              !row ||
              typeof row.text !== "string" ||
              typeof row.url !== "string" ||
              row.text.trim().length === 0
            ) {
              continue;
            }
            callToActions.push({ text: row.text.trim(), url: row.url.trim() });
          }
        }
      }
      if (meta.toolName === "showCoursesCatalog" && output.suppressed !== true) {
        if (
          typeof output.messageEn === "string" &&
          typeof output.messageAr === "string" &&
          typeof output.buttonTextEn === "string" &&
          typeof output.buttonTextAr === "string" &&
          typeof output.urlEn === "string" &&
          typeof output.urlAr === "string"
        ) {
          coursesCatalog = {
            messageEn: output.messageEn,
            messageAr: output.messageAr,
            buttonTextEn: output.buttonTextEn,
            buttonTextAr: output.buttonTextAr,
            urlEn: output.urlEn,
            urlAr: output.urlAr,
          };
        }
      }
      if (meta.toolName === "sendWhatsAppSupport" && output.suppressed !== true) {
        if (
          typeof output.messageEn === "string" &&
          typeof output.messageAr === "string" &&
          typeof output.buttonTextEn === "string" &&
          typeof output.buttonTextAr === "string" &&
          typeof output.url === "string"
        ) {
          whatsAppSupport = {
            messageEn: output.messageEn,
            messageAr: output.messageAr,
            buttonTextEn: output.buttonTextEn,
            buttonTextAr: output.buttonTextAr,
            url: output.url,
          };
        }
      }
    }
  }

  const text = (message.text ?? "").replace(/\u200c/g, "").trim();
  return {
    id: String(message.key ?? message.id ?? ""),
    role: message.role === "user" ? ("user" as const) : ("assistant" as const),
    text,
    status: message.status,
    courses,
    plans,
    callToActions,
    coursesCatalog,
    whatsAppSupport,
  };
}

async function countRecentPublicUserMessages(
  ctx: QueryCtx | MutationCtx,
  threadId: string,
  nowMs: number,
): Promise<number> {
  const result = await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
    threadId,
    order: "desc",
    excludeToolMessages: true,
    paginationOpts: {
      cursor: null,
      numItems: MAX_PUBLIC_MESSAGES_PER_WINDOW * 2,
    },
  });
  return result.page.filter((message) => {
    if (message.message?.role !== "user") {
      return false;
    }
    return nowMs - message._creationTime <= PUBLIC_RATE_WINDOW_MS;
  }).length;
}

export const getPublicConfig = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    greeting: assistantGreetingPublicValidator,
  }),
  handler: async (ctx) => {
    const settings = await getSettingsDoc(ctx, "public");
    return {
      enabled: settings?.publicEnabled === true,
      greeting: resolveAssistantGreeting(settings, PUBLIC_ASSISTANT_GREETING_DEFAULTS),
    };
  },
});

export const createPublicThread = mutation({
  args: {
    sessionId: v.string(),
    language: v.optional(assistantLanguageValidator),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requirePublicEnabled(ctx);
    const sessionId = parsePublicSessionId(args.sessionId);
    const userId = publicThreadUserId(sessionId);

    return await createThread(ctx, components.agent, {
      userId,
      title: "New conversation",
      summary: buildThreadSummary({ language: args.language, audience: "public" }),
    });
  },
});

export const sendPublicMessage = mutation({
  args: {
    sessionId: v.string(),
    threadId: v.string(),
    prompt: v.string(),
    language: v.optional(assistantLanguageValidator),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requirePublicEnabled(ctx);
    const { userId } = await authorizePublicThread(ctx, args.threadId, args.sessionId);

    const trimmed = args.prompt.trim();
    if (trimmed.length === 0) {
      throw new Error("Message cannot be empty");
    }
    if (trimmed.length > MAX_PUBLIC_PROMPT_LENGTH) {
      throw new Error("Message is too long");
    }

    const nowMs = Date.now();
    const totalUserMessages = await countUserThreadMessages(ctx, args.threadId);
    if (totalUserMessages >= MAX_PUBLIC_USER_MESSAGES) {
      throw new Error("This conversation has reached its message limit. Start a new chat.");
    }
    const recentCount = await countRecentPublicUserMessages(ctx, args.threadId, nowMs);
    if (recentCount >= MAX_PUBLIC_MESSAGES_PER_WINDOW) {
      throw new Error("Too many messages. Please wait a few minutes and try again.");
    }

    if (args.language) {
      await ctx.runMutation(components.agent.threads.updateThread, {
        threadId: args.threadId,
        patch: { summary: buildThreadSummary({ language: args.language, audience: "public" }) },
      });
    }

    const { messageId } = await rehamDivaAgent.saveMessage(ctx, {
      threadId: args.threadId,
      userId,
      prompt: trimmed,
      skipEmbeddings: true,
    });

    await ctx.scheduler.runAfter(0, internal.assistant.chat.streamAssistantResponse, {
      threadId: args.threadId,
      promptMessageId: messageId,
      userId,
      language: args.language,
      audience: "public",
    });

    return messageId;
  },
});

export const listPublicMessages = query({
  args: {
    sessionId: v.string(),
    threadId: v.string(),
  },
  returns: v.object({
    messages: v.array(publicChatMessageValidator),
    pending: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requirePublicEnabled(ctx);
    await authorizePublicThread(ctx, args.threadId, args.sessionId);

    const paginated = await listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: { numItems: MAX_LISTED_MESSAGES, cursor: null },
    });

    const visible = paginated.page
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => serializePublicMessage(message));

    const last = visible[visible.length - 1];
    const pending = Boolean(
      last &&
        (last.role === "user" || last.status === "streaming" || last.status === "pending"),
    );

    return { messages: visible, pending };
  },
});
