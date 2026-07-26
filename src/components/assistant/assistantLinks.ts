/** Safe http(s) or same-site relative path (not protocol-relative). */
export function isSafeAssistantUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith("/")) {
    return !trimmed.startsWith("//") && !trimmed.includes("://");
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function isInternalAssistantPath(url: string): boolean {
  return url.trim().startsWith("/") && isSafeAssistantUrl(url);
}

export type AssistantCtaButton = {
  text: string;
  url: string;
};

const MARKDOWN_LINK_URL_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Normalize URLs so CTA vs text-link dedupe is stable. */
export function normalizeAssistantUrlForCompare(url: string): string {
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

export function extractMarkdownLinkUrls(text: string): Set<string> {
  const urls = new Set<string>();
  if (!text) return urls;

  for (const match of text.matchAll(MARKDOWN_LINK_URL_RE)) {
    const url = match[2]?.trim();
    if (!url || !isSafeAssistantUrl(url)) continue;
    urls.add(normalizeAssistantUrlForCompare(url));
  }
  return urls;
}

/** Hide CTAs whose url already appears as a markdown link in the reply text. */
export function filterCallToActionsNotDuplicatedInText(
  callToActions: AssistantCtaButton[],
  text: string,
): AssistantCtaButton[] {
  if (callToActions.length === 0) return callToActions;
  const textUrls = extractMarkdownLinkUrls(text);
  if (textUrls.size === 0) return callToActions;
  return callToActions.filter(
    (cta) => !textUrls.has(normalizeAssistantUrlForCompare(cta.url)),
  );
}

export function normalizeCtaButtons(value: unknown): AssistantCtaButton[] {
  if (!Array.isArray(value)) return [];
  const buttons: AssistantCtaButton[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.text !== "string" || typeof record.url !== "string") continue;
    const text = record.text.trim();
    const url = record.url.trim();
    if (!text || !isSafeAssistantUrl(url)) continue;
    buttons.push({ text, url });
  }
  return buttons;
}
