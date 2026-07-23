import type { UIMessage } from "@convex-dev/agent/react";
import type {
  ActiveSubscriptionPlan,
  CourseSearchResult,
  ParsedToolResults,
  SubscriptionToolResult,
} from "./types";

function isCourseSearchResult(value: unknown): value is CourseSearchResult {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.title === "string";
}

function isCourseSearchResultArray(value: unknown): value is CourseSearchResult[] {
  return Array.isArray(value) && value.every(isCourseSearchResult);
}

function isActiveSubscriptionPlan(value: unknown): value is ActiveSubscriptionPlan {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.nameEn === "string" &&
    typeof record.nameAr === "string" &&
    (record.billingInterval === "month" || record.billingInterval === "year") &&
    typeof record.priceAmount === "number" &&
    typeof record.priceCurrency === "string" &&
    Array.isArray(record.featureTitlesEn) &&
    Array.isArray(record.featureTitlesAr) &&
    typeof record.isCurrentPlan === "boolean" &&
    typeof record.isAtCapacity === "boolean"
  );
}

function isActiveSubscriptionPlanArray(value: unknown): value is ActiveSubscriptionPlan[] {
  return Array.isArray(value) && value.every(isActiveSubscriptionPlan);
}

function isSubscriptionToolResult(value: unknown): value is SubscriptionToolResult {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.authenticated === "boolean" && typeof record.status === "string";
}

function isRenderUiCardsResult(value: unknown): value is {
  courses: unknown;
  plans: unknown;
  subscription: unknown;
  billingPortalUrl: unknown;
} {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.courses) &&
    Array.isArray(record.plans) &&
    "subscription" in record &&
    "billingPortalUrl" in record
  );
}

function emptyResults(): ParsedToolResults {
  return {
    courses: [],
    plans: [],
    subscription: null,
    billingPortalUrl: null,
  };
}

function applyRenderUiCardsOutput(
  output: {
    courses: unknown;
    plans: unknown;
    subscription: unknown;
    billingPortalUrl: unknown;
  },
  results: ParsedToolResults,
) {
  if (isCourseSearchResultArray(output.courses)) {
    results.courses.push(...output.courses);
  }
  if (isActiveSubscriptionPlanArray(output.plans)) {
    results.plans.push(...output.plans);
  }
  if (output.subscription === null) {
    results.subscription = null;
  } else if (isSubscriptionToolResult(output.subscription)) {
    results.subscription = output.subscription;
  }
  if (output.billingPortalUrl === null) {
    results.billingPortalUrl = null;
  } else if (
    typeof output.billingPortalUrl === "string" &&
    output.billingPortalUrl.startsWith("https://")
  ) {
    results.billingPortalUrl = output.billingPortalUrl;
  }
}

function getToolPartMeta(part: unknown): { toolName: string; output: unknown } | null {
  if (!part || typeof part !== "object") return null;
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

  if (!toolName || output === undefined) return null;
  return { toolName, output };
}

/** Cards/buttons only come from renderUiCards — never from lookup tools. */
export function parseToolResultsFromMessage(message: UIMessage): ParsedToolResults {
  const results = emptyResults();

  for (const part of message.parts ?? []) {
    const meta = getToolPartMeta(part);
    if (!meta || meta.toolName !== "renderUiCards" || !isRenderUiCardsResult(meta.output)) {
      continue;
    }
    applyRenderUiCardsOutput(meta.output, results);
  }

  return results;
}
