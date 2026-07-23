import { markdownToPlainText } from "@/lib/utils";

export function formatAssistantMessageText(text: string): string {
  return markdownToPlainText(text);
}

export function formatCourseDescriptionPreview(description: string): string {
  return markdownToPlainText(description);
}
