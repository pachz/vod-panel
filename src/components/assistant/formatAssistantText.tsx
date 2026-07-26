import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { markdownToPlainText } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { isInternalAssistantPath, isSafeAssistantUrl } from "./assistantLinks";

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

type TextSegment =
  | { type: "text"; value: string }
  | { type: "link"; text: string; url: string };

/**
 * Strips markdown while preserving [label](url) as real links for rendering.
 */
export function parseAssistantTextSegments(text: string): TextSegment[] {
  if (!text) return [];

  const placeholders: Array<{ text: string; url: string }> = [];
  const withPlaceholders = text.replace(MARKDOWN_LINK_RE, (_match, label: string, url: string) => {
    const trimmedUrl = url.trim();
    const labelText = markdownToPlainText(label) || label;
    if (!isSafeAssistantUrl(trimmedUrl)) {
      return labelText;
    }
    const index = placeholders.length;
    placeholders.push({ text: labelText, url: trimmedUrl });
    return `\u0000LINK${index}\u0000`;
  });

  const plain = markdownToPlainText(withPlaceholders);
  if (!plain) return [];

  const segments: TextSegment[] = [];
  const parts = plain.split(/(\u0000LINK\d+\u0000)/g);

  for (const part of parts) {
    if (!part) continue;
    const linkMatch = part.match(/^\u0000LINK(\d+)\u0000$/);
    if (linkMatch) {
      const placeholder = placeholders[Number(linkMatch[1])];
      if (placeholder) {
        segments.push({ type: "link", text: placeholder.text, url: placeholder.url });
      }
      continue;
    }
    segments.push({ type: "text", value: part });
  }

  return segments;
}

export function formatAssistantMessageText(text: string): string {
  return markdownToPlainText(text);
}

export function formatCourseDescriptionPreview(description: string): string {
  return markdownToPlainText(description);
}

type AssistantRichTextProps = {
  text: string;
  className?: string;
};

export function AssistantRichText({ text, className }: AssistantRichTextProps) {
  const { localizedPath } = useLanguage();
  const segments = parseAssistantTextSegments(text);

  if (segments.length === 0) {
    return null;
  }

  const nodes: ReactNode[] = segments.map((segment, index) => {
    if (segment.type === "text") {
      return <span key={index}>{segment.value}</span>;
    }

    if (isInternalAssistantPath(segment.url)) {
      return (
        <Link
          key={index}
          to={localizedPath(segment.url)}
          className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
        >
          {segment.text}
        </Link>
      );
    }

    return (
      <a
        key={index}
        href={segment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
      >
        {segment.text}
      </a>
    );
  });

  return <p className={className}>{nodes}</p>;
}
