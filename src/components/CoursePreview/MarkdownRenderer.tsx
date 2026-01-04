import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

export const renderMarkdown = (value?: string | null, isRTL: boolean = false) => {
  if (!value || !value.trim()) {
    return <p className="text-sm text-muted-foreground">Content for this section is coming soon.</p>;
  }

  return (
    <div className={cn("prose prose-sm max-w-none dark:prose-invert", isRTL && "prose-rtl")} dir={isRTL ? "rtl" : "ltr"}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="text-sm leading-6 text-muted-foreground mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 mb-3 last:mb-0 text-sm leading-6 text-muted-foreground">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 mb-3 last:mb-0 text-sm leading-6 text-muted-foreground">{children}</ol>,
          li: ({ children }) => <li className="text-sm leading-6 text-muted-foreground">{children}</li>,
          h1: ({ children }) => <h1 className="text-2xl font-bold mb-3 mt-4 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-semibold mb-2 mt-3 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-semibold mb-2 mt-3 first:mt-0">{children}</h3>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
          blockquote: ({ children }) => <blockquote className="border-l-4 border-primary pl-4 italic my-3">{children}</blockquote>,
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
};

