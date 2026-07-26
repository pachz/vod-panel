import type { Components } from "react-markdown";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";

import {
  parseAlignedMarkdown,
  TEXT_ALIGN_CLASS,
  type TextAlign,
} from "@/lib/markdownAlignment";
import { cn } from "@/lib/utils";

type MarkdownContentProps = {
  value: string;
  className?: string;
  dir?: "ltr" | "rtl";
  components?: Components;
  emptyFallback?: ReactNode;
};

const DEFAULT_COMPONENTS: Components = {
  p: ({ children }) => (
    <p className="mb-3 text-sm leading-6 text-muted-foreground last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-muted-foreground last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-sm leading-6 text-muted-foreground">{children}</li>
  ),
  h1: ({ children }) => (
    <h1 className="mb-3 mt-4 text-2xl font-bold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-3 text-xl font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-3 text-lg font-semibold first:mt-0">{children}</h3>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-primary pl-4 italic">{children}</blockquote>
  ),
};

function AlignedBlock({
  align,
  children,
}: {
  align: TextAlign;
  children: ReactNode;
}) {
  return (
    <div className={TEXT_ALIGN_CLASS[align]} style={{ textAlign: align }}>
      {children}
    </div>
  );
}

export const MarkdownContent = ({
  value,
  className,
  dir,
  components,
  emptyFallback = (
    <span className="text-sm text-muted-foreground">Add some content…</span>
  ),
}: MarkdownContentProps) => {
  const safeValue = value ?? "";
  if (!safeValue.trim()) {
    return <>{emptyFallback}</>;
  }

  const mergedComponents = { ...DEFAULT_COMPONENTS, ...components };
  const segments = parseAlignedMarkdown(safeValue);

  return (
    <div className={cn(className)} dir={dir}>
      {segments.map((segment, index) => {
        if (!segment.content.trim()) {
          return null;
        }

        const markdown = (
          <ReactMarkdown components={mergedComponents}>
            {segment.content}
          </ReactMarkdown>
        );

        if (segment.type === "aligned") {
          return (
            <AlignedBlock key={`aligned-${index}`} align={segment.align}>
              {markdown}
            </AlignedBlock>
          );
        }

        return <div key={`markdown-${index}`}>{markdown}</div>;
      })}
    </div>
  );
};
