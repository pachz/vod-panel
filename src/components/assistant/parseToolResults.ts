import type { UIMessage } from "@convex-dev/agent/react";
import type {
  BillingPortalResult,
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

function isSubscriptionToolResult(value: unknown): value is SubscriptionToolResult {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.authenticated === "boolean" && typeof record.status === "string";
}

function isBillingPortalResult(value: unknown): value is BillingPortalResult {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.url === "string" && record.url.startsWith("https://");
}

function extractFromPart(part: unknown, results: ParsedToolResults) {
  if (!part || typeof part !== "object") return;
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

  if (!toolName || output === undefined) return;

  if (toolName === "searchCourses" && isCourseSearchResultArray(output)) {
    results.courses.push(...output);
    return;
  }

  if (toolName === "getMySubscription" && isSubscriptionToolResult(output)) {
    results.subscription = output;
    return;
  }

  if (toolName === "createBillingPortalSession") {
    if (isBillingPortalResult(output)) {
      results.billingPortalUrl = output.url;
    }
  }
}

export function parseToolResultsFromMessage(message: UIMessage): ParsedToolResults {
  const results: ParsedToolResults = {
    courses: [],
    subscription: null,
    billingPortalUrl: null,
  };

  for (const part of message.parts ?? []) {
    extractFromPart(part, results);
  }

  return results;
}
