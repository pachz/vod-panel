import { MarkdownContent } from "@/components/MarkdownContent";
import { cn } from "@/lib/utils";

export const renderMarkdown = (value?: string | null, isRTL: boolean = false) => {
  if (!value || !value.trim()) {
    return (
      <p className="text-sm text-muted-foreground">
        Content for this section is coming soon.
      </p>
    );
  }

  return (
    <MarkdownContent
      value={value}
      dir={isRTL ? "rtl" : "ltr"}
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert",
        isRTL && "prose-rtl",
      )}
    />
  );
};
