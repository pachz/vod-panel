import { markdownToPlainText } from "@/lib/utils";

const INTRO_MAX_LENGTH = 240;

export function formatAssistantMessageText(
  text: string,
  options?: { hasStructuredCards?: boolean },
): string {
  const plain = markdownToPlainText(text);
  if (!plain) {
    return "";
  }

  if (!options?.hasStructuredCards) {
    return plain;
  }

  const intro = plain.split(/\n\n+/)[0]?.trim() ?? plain;
  if (intro.length <= INTRO_MAX_LENGTH) {
    return intro;
  }

  return `${intro.slice(0, INTRO_MAX_LENGTH).trimEnd()}…`;
}

export function formatCourseDescriptionPreview(description: string): string {
  return markdownToPlainText(description);
}
