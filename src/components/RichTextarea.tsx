import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Bold, Italic, List, Maximize2, Quote, Type, Edit, Eye } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type FormattingAction = "bold" | "italic" | "list" | "quote" | "heading";

type RichTextareaProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  rows?: number;
  dir?: "ltr" | "rtl";
  className?: string;
  labelClassName?: string;
  textareaClassName?: string;
  modalTitle?: string;
};

const FORMATTING_BUTTONS: Array<{
  action: FormattingAction;
  icon: ComponentType<{ className?: string }>;
  label: string;
}> = [
  { action: "bold", icon: Bold, label: "Bold" },
  { action: "italic", icon: Italic, label: "Italic" },
  { action: "heading", icon: Type, label: "Heading" },
  { action: "quote", icon: Quote, label: "Quote" },
  { action: "list", icon: List, label: "Bulleted list" },
];

export const RichTextarea = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  description,
  maxLength,
  required,
  rows = 3,
  dir,
  className,
  labelClassName,
  textareaClassName,
  modalTitle,
}: RichTextareaProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingValue, setEditingValue] = useState(value ?? "");
  const [previousValue, setPreviousValue] = useState(value ?? "");
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const dialogTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleDialogOpen = useCallback((open: boolean) => {
    if (open) {
      // Save the current value as previous when opening
      setPreviousValue(value ?? "");
      setEditingValue(value ?? "");
      setActiveTab("edit");
    }
    setIsDialogOpen(open);
  }, [value]);

  const handleSave = useCallback(() => {
    onChange(editingValue);
    setIsDialogOpen(false);
  }, [editingValue, onChange]);

  const handleCancel = useCallback(() => {
    // Revert to previous value
    setEditingValue(previousValue);
    setIsDialogOpen(false);
  }, [previousValue]);

  const handleDialogClose = useCallback((open: boolean) => {
    if (!open) {
      // If closing without explicit save/cancel, revert
      handleCancel();
    } else {
      setIsDialogOpen(open);
    }
  }, [handleCancel]);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    const textarea = dialogTextareaRef.current;
    if (!textarea) {
      return;
    }

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = textarea.value.length;
      textarea.selectionEnd = textarea.value.length;
    });
  }, [isDialogOpen]);

  // Sync editing value when value prop changes (but not when dialog is open)
  useEffect(() => {
    if (!isDialogOpen) {
      setEditingValue(value ?? "");
    }
  }, [value, isDialogOpen]);

  const applyFormatting = useCallback(
    (action: FormattingAction) => {
      const textarea = dialogTextareaRef.current;
      if (!textarea) {
        return;
      }

      const { selectionStart, selectionEnd, value: currentValue } = textarea;
      const selectedText = currentValue.slice(selectionStart, selectionEnd);

      const surroundSelection = (
        before: string,
        after = before,
        transform?: (input: string) => string,
      ) => {
        const content = transform ? transform(selectedText) : selectedText;
        const newValue =
          currentValue.slice(0, selectionStart) +
          before +
          content +
          after +
          currentValue.slice(selectionEnd);

        setEditingValue(newValue);

        const nextSelectionStart = selectionStart + before.length;
        const nextSelectionEnd = nextSelectionStart + content.length;

        requestAnimationFrame(() => {
          textarea.focus();
          textarea.selectionStart = nextSelectionStart;
          textarea.selectionEnd = nextSelectionEnd;
        });
      };

      switch (action) {
        case "bold":
          surroundSelection("**");
          break;
        case "italic":
          surroundSelection("*");
          break;
        case "heading":
          surroundSelection("## ", "");
          break;
        case "quote": {
          surroundSelection("> ", "", (input) => {
            const lines = input.split(/\r?\n/);
            return lines
              .map((line) => (line ? `> ${line}` : ">"))
              .join("\n");
          });
          break;
        }
        case "list": {
          if (!selectedText) {
            surroundSelection("- ");
            break;
          }

          const lines = selectedText.split(/\r?\n/);
          const formatted = lines
            .map((line) => {
              const trimmed = line.trim();
              if (!trimmed) {
                return "- ";
              }
              if (/^-{1,2}\s/.test(trimmed)) {
                return trimmed;
              }
              return `- ${trimmed}`;
            })
            .join("\n");

          surroundSelection("", "", () => formatted);
          break;
        }
        default:
          break;
      }
    },
    [],
  );

  const formattingButtons = useMemo(() => FORMATTING_BUTTONS, []);

  const renderInline = useCallback((input: string) => {
    if (!input) {
      return null;
    }

    const nodes: ReactNode[] = [];
    const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(input)) !== null) {
      const [token] = match;
      if (match.index > lastIndex) {
        nodes.push(
          <span key={`${match.index}-text`}>
            {input.slice(lastIndex, match.index)}
          </span>,
        );
      }

      if (token.startsWith("**")) {
        nodes.push(
          <strong key={`${match.index}-bold`}>
            {token.slice(2, -2)}
          </strong>,
        );
      } else if (token.startsWith("*")) {
        nodes.push(
          <em key={`${match.index}-italic`}>
            {token.slice(1, -1)}
          </em>,
        );
      }

      lastIndex = match.index + token.length;
    }

    if (lastIndex < input.length) {
      nodes.push(
        <span key={`${lastIndex}-rest`}>
          {input.slice(lastIndex)}
        </span>,
      );
    }

    return nodes;
  }, []);

  const previewContent = useMemo(() => {
    const safeValue = value ?? "";
    if (!safeValue.trim()) {
      return (
        <span className="text-sm text-muted-foreground">
          Add some content…
        </span>
      );
    }

    const elements: ReactNode[] = [];
    const lines = safeValue.split(/\r?\n/);
    let currentList: string[] = [];

    const flushList = () => {
      if (currentList.length === 0) {
        return;
      }
      const items = currentList.map((item, index) => (
        <li key={`list-item-${index}`}>{renderInline(item)}</li>
      ));
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc space-y-1 pl-5">
          {items}
        </ul>,
      );
      currentList = [];
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (!trimmed) {
        flushList();
        elements.push(<div key={`spacer-${index}`} className="h-2" />);
        return;
      }

      if (trimmed.startsWith("- ")) {
        currentList.push(trimmed.slice(2));
        return;
      }

      flushList();

      if (trimmed.startsWith("##")) {
        elements.push(
          <h3 key={`heading-${index}`} className="text-lg font-semibold">
            {renderInline(trimmed.replace(/^#+\s*/, ""))}
          </h3>,
        );
        return;
      }

      if (trimmed.startsWith(">")) {
        elements.push(
          <blockquote
            key={`quote-${index}`}
            className="border-l-2 border-border pl-3 italic text-muted-foreground"
          >
            {renderInline(trimmed.replace(/^>\s?/, ""))}
          </blockquote>,
        );
        return;
      }

      elements.push(
        <p key={`paragraph-${index}`} className="text-sm leading-6">
          {renderInline(trimmed)}
        </p>,
      );
    });

    flushList();

    return elements;
  }, [renderInline, value]);

  const minHeight = rows * 24;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className={labelClassName}>
          {label}
        </Label>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Expand ${label}`}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{modalTitle ?? label}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden flex flex-col space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {formattingButtons.map(({ action, icon: Icon, label: text }) => (
                    <Button
                      key={action}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyFormatting(action)}
                      className="gap-1"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{text}</span>
                    </Button>
                  ))}
                </div>
                <TooltipProvider>
                  <div className="flex items-center gap-1 rounded-md border border-border bg-muted/50 p-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveTab("edit")}
                          className={cn(
                            "h-7 w-7 p-0",
                            activeTab === "edit" && "bg-background text-foreground shadow-sm border border-border"
                          )}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Edit</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveTab("preview")}
                          className={cn(
                            "h-7 w-7 p-0",
                            activeTab === "preview" && "bg-background text-foreground shadow-sm border border-border"
                          )}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Preview</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "edit" | "preview")} className="flex-1 flex flex-col overflow-hidden">
                <TabsContent value="edit" className="flex-1 overflow-auto mt-0">
                  <Textarea
                    ref={dialogTextareaRef}
                    id={`${id}-expanded`}
                    value={editingValue}
                    onChange={(event) => setEditingValue(event.target.value)}
                    placeholder={placeholder}
                    maxLength={maxLength}
                    required={required}
                    dir={dir}
                    className={cn(
                      "min-h-[18rem] resize-none text-base leading-6",
                      dir === "rtl" && "text-right",
                    )}
                  />
                </TabsContent>
                <TabsContent value="preview" className="flex-1 overflow-auto mt-0">
                  <div className={cn(
                    "prose prose-sm max-w-none dark:prose-invert min-h-[18rem] p-4 border rounded-md",
                    dir === "rtl" && "prose-rtl"
                  )} dir={dir}>
                    {editingValue.trim() ? (
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
                        {editingValue}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-sm text-muted-foreground">Add some content to see the preview...</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
              {description ? (
                <p className="text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="cta"
                onClick={handleSave}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <button
        type="button"
        onClick={() => handleDialogOpen(true)}
        className={cn(
          "flex w-full flex-col rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
          dir === "rtl" ? "items-end text-right" : "items-start text-left",
          textareaClassName,
        )}
        style={{ minHeight }}
        aria-label={`Edit ${label}`}
      >
        <div
          className={cn("space-y-1 w-full", dir === "rtl" && "text-right", textareaClassName)}
          dir={dir}
        >
          {previewContent}
        </div>
      </button>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
};

