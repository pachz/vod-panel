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
