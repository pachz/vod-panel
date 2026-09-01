import { v } from "convex/values";

export const assistantAudienceValidator = v.union(
  v.literal("members"),
  v.literal("public"),
);

export type AssistantAudience = "members" | "public";

export type AssistantSettingsKey = "global" | "public";

export const PUBLIC_ASSISTANT_SESSION_PREFIX = "public:";

export const PUBLIC_ASSISTANT_SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;

export function settingsKeyForAudience(audience: AssistantAudience): AssistantSettingsKey {
  return audience === "public" ? "public" : "global";
}

export function publicThreadUserId(sessionId: string): string {
  return `${PUBLIC_ASSISTANT_SESSION_PREFIX}${sessionId}`;
}

export function isPublicThreadUserId(userId: string | undefined | null): boolean {
  return typeof userId === "string" && userId.startsWith(PUBLIC_ASSISTANT_SESSION_PREFIX);
}

export function parsePublicSessionId(sessionId: string): string {
  const trimmed = sessionId.trim();
  if (!PUBLIC_ASSISTANT_SESSION_ID_PATTERN.test(trimmed)) {
    throw new Error("Invalid session");
  }
  return trimmed;
}
