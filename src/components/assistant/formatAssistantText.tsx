import { markdownToPlainText } from "@/lib/utils";

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/**
 * Strip markdown, converting [label](url) to label text only (no hyperlinks).
 */
export function formatAssistantMessageText(text: string): string {
  if (!text) return "";
  // Drop turn-settlement markers and other invisible format chars from display.
  const withoutInvisible = text.replace(/[\u200b-\u200d\ufeff]/g, "");
  if (!withoutInvisible.trim()) return "";
  const withoutLinks = withoutInvisible.replace(MARKDOWN_LINK_RE, (_match, label: string) => {
    return markdownToPlainText(label) || label;
  });
  return markdownToPlainText(withoutLinks);
}

export function formatCourseDescriptionPreview(description: string): string {
  return formatAssistantMessageText(description);
}

type AssistantRichTextProps = {
  text: string;
  className?: string;
};

export function AssistantRichText({ text, className }: AssistantRichTextProps) {
  const plain = formatAssistantMessageText(text);
  if (!plain) {
    return null;
  }

  return <p className={className}>{plain}</p>;
}
