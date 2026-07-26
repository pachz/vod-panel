export type TextAlign = "left" | "center" | "right" | "justify";

export type MarkdownSegment =
  | { type: "markdown"; content: string }
  | { type: "aligned"; align: TextAlign; content: string };

const ALIGN_VALUES = new Set<TextAlign>(["left", "center", "right", "justify"]);

const FENCE_OPEN_RE = /^:::\s*(left|center|right|justify)\s*$/i;
const FENCE_CLOSE_RE = /^:::\s*$/;

export function isTextAlign(value: string): value is TextAlign {
  return ALIGN_VALUES.has(value as TextAlign);
}

export function unwrapAlignment(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length < 2) {
    return text;
  }

  const first = lines[0]?.trim() ?? "";
  const last = lines[lines.length - 1]?.trim() ?? "";
  if (FENCE_OPEN_RE.test(first) && FENCE_CLOSE_RE.test(last)) {
    return lines.slice(1, -1).join("\n");
  }

  return text;
}

export function wrapWithAlignment(text: string, align: TextAlign): string {
  const unwrapped = unwrapAlignment(text).replace(/^\n+|\n+$/g, "");
  if (align === "left") {
    return unwrapped;
  }
  return `::: ${align}\n${unwrapped}\n:::`;
}

export function parseAlignedMarkdown(source: string): MarkdownSegment[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const segments: MarkdownSegment[] = [];
  let buffer: string[] = [];
  let index = 0;

  const flushBuffer = () => {
    if (buffer.length === 0) {
      return;
    }
    segments.push({ type: "markdown", content: buffer.join("\n") });
    buffer = [];
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const openMatch = line.trim().match(FENCE_OPEN_RE);
    if (openMatch?.[1] && isTextAlign(openMatch[1].toLowerCase())) {
      flushBuffer();
      const align = openMatch[1].toLowerCase() as TextAlign;
      index += 1;
      const contentLines: string[] = [];
      while (index < lines.length) {
        const contentLine = lines[index] ?? "";
        if (FENCE_CLOSE_RE.test(contentLine.trim())) {
          index += 1;
          break;
        }
        contentLines.push(contentLine);
        index += 1;
      }
      segments.push({
        type: "aligned",
        align,
        content: contentLines.join("\n"),
      });
      continue;
    }

    buffer.push(line);
    index += 1;
  }

  flushBuffer();
  return segments;
}

function offsetToLineIndex(value: string, offset: number): number {
  let line = 0;
  let cursor = 0;
  while (cursor < offset && cursor < value.length) {
    if (value[cursor] === "\n") {
      line += 1;
    }
    cursor += 1;
  }
  return line;
}

function lineIndexToOffset(value: string, lineIndex: number): number {
  if (lineIndex <= 0) {
    return 0;
  }
  let line = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "\n") {
      line += 1;
      if (line === lineIndex) {
        return i + 1;
      }
    }
  }
  return value.length;
}

function findEnclosingAlignRange(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): { start: number; end: number } | null {
  const normalized = value.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const startLine = offsetToLineIndex(normalized, selectionStart);
  const endLine = offsetToLineIndex(normalized, Math.max(selectionEnd - 1, selectionStart));

  let openLine = -1;
  for (let i = startLine; i >= 0; i -= 1) {
    if (FENCE_OPEN_RE.test(lines[i]?.trim() ?? "")) {
      openLine = i;
      break;
    }
    if (FENCE_CLOSE_RE.test(lines[i]?.trim() ?? "") && i < startLine) {
      break;
    }
  }

  if (openLine < 0) {
    return null;
  }

  let closeLine = -1;
  for (let i = openLine + 1; i < lines.length; i += 1) {
    if (FENCE_CLOSE_RE.test(lines[i]?.trim() ?? "")) {
      closeLine = i;
      break;
    }
  }

  if (closeLine < 0 || endLine > closeLine) {
    return null;
  }

  return {
    start: lineIndexToOffset(normalized, openLine),
    end: lineIndexToOffset(normalized, closeLine + 1),
  };
}

function getParagraphRange(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): { start: number; end: number } {
  if (selectionStart !== selectionEnd) {
    return { start: selectionStart, end: selectionEnd };
  }

  const enclosing = findEnclosingAlignRange(value, selectionStart, selectionEnd);
  if (enclosing) {
    return enclosing;
  }

  let start = selectionStart;
  let end = selectionEnd;

  while (start > 0) {
    if (value.slice(Math.max(0, start - 2), start) === "\n\n") {
      break;
    }
    start -= 1;
  }

  while (end < value.length) {
    if (value.slice(end, end + 2) === "\n\n") {
      break;
    }
    end += 1;
  }

  while (start < end && value[start] === "\n") {
    start += 1;
  }
  while (end > start && value[end - 1] === "\n") {
    end -= 1;
  }

  return { start, end };
}

export function applyTextAlignment(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  align: TextAlign,
): { value: string; selectionStart: number; selectionEnd: number } {
  const normalized = value.replace(/\r\n/g, "\n");
  const range = getParagraphRange(normalized, selectionStart, selectionEnd);
  const selected = normalized.slice(range.start, range.end);
  const replacement = wrapWithAlignment(selected, align);

  const nextValue =
    normalized.slice(0, range.start) + replacement + normalized.slice(range.end);

  return {
    value: nextValue,
    selectionStart: range.start,
    selectionEnd: range.start + replacement.length,
  };
}

export const TEXT_ALIGN_CLASS: Record<TextAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
};
