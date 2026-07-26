import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Edit,
  Eye,
  Italic,
  List,
  Maximize2,
  Quote,
  Type,
} from "lucide-react";

import { MarkdownContent } from "@/components/MarkdownContent";
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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  applyTextAlignment,
  type TextAlign,
} from "@/lib/markdownAlignment";
import { cn } from "@/lib/utils";

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

const ALIGNMENT_BUTTONS: Array<{
  align: TextAlign;
  icon: ComponentType<{ className?: string }>;
  label: string;
}> = [
  { align: "left", icon: AlignLeft, label: "Align left" },
  { align: "center", icon: AlignCenter, label: "Align center" },
  { align: "right", icon: AlignRight, label: "Align right" },
  { align: "justify", icon: AlignJustify, label: "Justify" },
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

  const handleDialogOpen = useCallback(
    (open: boolean) => {
      if (open) {
        setPreviousValue(value ?? "");
        setEditingValue(value ?? "");
        setActiveTab("edit");
      }
      setIsDialogOpen(open);
    },
    [value],
  );

  const handleSave = useCallback(() => {
    onChange(editingValue);
    setIsDialogOpen(false);
  }, [editingValue, onChange]);

  const handleCancel = useCallback(() => {
    setEditingValue(previousValue);
    setIsDialogOpen(false);
  }, [previousValue]);

  const handleDialogClose = useCallback(
    (open: boolean) => {
      if (!open) {
        handleCancel();
      } else {
        setIsDialogOpen(open);
      }
    },
    [handleCancel],
  );

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

  useEffect(() => {
    if (!isDialogOpen) {
      setEditingValue(value ?? "");
    }
  }, [value, isDialogOpen]);

  const applyFormatting = useCallback((action: FormattingAction) => {
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
          return lines.map((line) => (line ? `> ${line}` : ">")).join("\n");
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
  }, []);

  const applyAlignment = useCallback((align: TextAlign) => {
    const textarea = dialogTextareaRef.current;
    if (!textarea) {
      return;
    }

    const result = applyTextAlignment(
      textarea.value,
      textarea.selectionStart,
      textarea.selectionEnd,
      align,
    );

    setEditingValue(result.value);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = result.selectionStart;
      textarea.selectionEnd = result.selectionEnd;
    });
  }, []);

  const formattingButtons = useMemo(() => FORMATTING_BUTTONS, []);
  const alignmentButtons = useMemo(() => ALIGNMENT_BUTTONS, []);

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
          <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>{modalTitle ?? label}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-1 flex-col space-y-4 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
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
                  <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
                  <TooltipProvider>
                    {alignmentButtons.map(({ align, icon: Icon, label: text }) => (
                      <Tooltip key={align}>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => applyAlignment(align)}
                            aria-label={text}
                            className="h-8 w-8 p-0"
                          >
                            <Icon className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{text}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </TooltipProvider>
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
                            activeTab === "edit" &&
                              "border border-border bg-background text-foreground shadow-sm",
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
                            activeTab === "preview" &&
                              "border border-border bg-background text-foreground shadow-sm",
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
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as "edit" | "preview")}
                className="flex flex-1 flex-col overflow-hidden"
              >
                <TabsContent value="edit" className="mt-0 flex-1 overflow-auto">
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
                <TabsContent value="preview" className="mt-0 flex-1 overflow-auto">
                  <MarkdownContent
                    value={editingValue}
                    dir={dir}
                    className={cn(
                      "prose prose-sm min-h-[18rem] max-w-none rounded-md border p-4 dark:prose-invert",
                      dir === "rtl" && "prose-rtl",
                    )}
                    emptyFallback={
                      <p className="text-sm text-muted-foreground">
                        Add some content to see the preview...
                      </p>
                    }
                  />
                </TabsContent>
              </Tabs>
              {description ? (
                <p className="text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="button" variant="cta" onClick={handleSave}>
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
        <MarkdownContent
          value={value ?? ""}
          dir={dir}
          className={cn("w-full space-y-1", dir === "rtl" && "text-right", textareaClassName)}
        />
      </button>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
};
