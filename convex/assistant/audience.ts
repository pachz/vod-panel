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

export function parseThreadSummary(summary: string | undefined | null): {
  language: "en" | "ar" | undefined;
  audience: AssistantAudience;
} {
  const parts = (summary ?? "")
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  let language: "en" | "ar" | undefined;
  let audience: AssistantAudience = "members";

  for (const part of parts) {
    if (part.startsWith("lang:")) {
      const value = part.slice("lang:".length);
      if (value === "en" || value === "ar") {
        language = value;
      }
    } else if (part.startsWith("audience:")) {
      const value = part.slice("audience:".length);
      if (value === "public" || value === "members") {
        audience = value;
      }
    }
  }

  return { language, audience };
}

export function buildThreadSummary(options: {
  language?: "en" | "ar";
  audience?: AssistantAudience;
}): string | undefined {
  const parts: Array<string> = [];
  if (options.language) {
    parts.push(`lang:${options.language}`);
  }
  if (options.audience === "public") {
    parts.push("audience:public");
  }
  return parts.length > 0 ? parts.join("|") : undefined;
}
