import { getThreadMetadata } from "@convex-dev/agent";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { components } from "../_generated/api";

export const DEFAULT_THREAD_TITLE = "New conversation";
/** Max user messages while title can still be set automatically or via tool. */
export const EARLY_CONVERSATION_USER_MESSAGE_LIMIT = 8;
export const MAX_CONVERSATION_TITLE_LENGTH = 60;

type ToolLikeCtx = {
  userId?: string | null;
  threadId?: string;
  runQuery: ActionCtx["runQuery"];
};

export async function resolveAssistantUserId(
  ctx: ToolLikeCtx,
): Promise<Id<"users"> | null> {
  if (ctx.userId) {
    return ctx.userId as Id<"users">;
  }

  if (!ctx.threadId) {
    return null;
  }

  const thread = await ctx.runQuery(components.agent.threads.getThread, {
    threadId: ctx.threadId,
  });

  if (!thread?.userId) {
    return null;
  }

  return thread.userId as Id<"users">;
}

export async function ensureThreadHasUserId(
  ctx: MutationCtx,
  threadId: string,
  userId: Id<"users">,
): Promise<void> {
  const metadata = await getThreadMetadata(ctx, components.agent, { threadId });
  if (metadata.userId === userId) {
    return;
  }

  await ctx.runMutation(components.agent.threads.updateThread, {
    threadId,
    patch: { userId },
  });
}

export function sanitizeConversationTitle(raw: string): string | null {
  const title = raw.replace(/\s+/g, " ").trim();
  if (title.length < 3 || title.length > MAX_CONVERSATION_TITLE_LENGTH) {
    return null;
  }
  return title;
}

export async function countUserThreadMessages(
  ctx: QueryCtx | MutationCtx,
  threadId: string,
): Promise<number> {
  const result = await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
    threadId,
    order: "desc",
    excludeToolMessages: true,
    paginationOpts: {
      cursor: null,
      numItems: EARLY_CONVERSATION_USER_MESSAGE_LIMIT * 4,
    },
  });

  return result.page.filter((message) => message.message?.role === "user").length;
}

export function titleFromUserMessage(text: string): string | null {
  const plain = text.replace(/\s+/g, " ").trim();
  if (plain.length < 3) {
    return null;
  }

  if (plain.length <= MAX_CONVERSATION_TITLE_LENGTH) {
    return sanitizeConversationTitle(plain);
  }

  const shortened = `${plain.slice(0, MAX_CONVERSATION_TITLE_LENGTH - 1).trimEnd()}…`;
  return sanitizeConversationTitle(shortened);
}

export async function assertThreadOwnedByUser(
  ctx: QueryCtx | MutationCtx,
  threadId: string,
  userId: Id<"users">,
): Promise<void> {
  const metadata = await getThreadMetadata(ctx, components.agent, { threadId });
  if (metadata.userId !== userId) {
    throw new Error("Unauthorized: thread does not belong to user");
  }
}
