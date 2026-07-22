import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MessagesSquare } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { KnowledgeFilesSection } from "@/components/assistant/KnowledgeFilesSection";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 20_000;
const MAX_DESCRIPTION_ADDON_LENGTH = 4_000;

type AssistantSettingsData = FunctionReturnType<typeof api.assistant.settings.getAssistantSettings>;
type ToolKnowledgeItem = AssistantSettingsData["tools"][number];

const AssistantSettings = () => {
  const currentUser = useQuery(api.user.getCurrentUser);
  const settings = useQuery(api.assistant.settings.getAssistantSettings);
  const updateSettings = useMutation(api.assistant.settings.updateAssistantSettings);
  const updateToolKnowledge = useMutation(api.assistant.settings.updateAssistantToolKnowledge);
  const isTech = currentUser?.isTech ?? false;
  const [customInstructions, setCustomInstructions] = useState("");
  const [addonDrafts, setAddonDrafts] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savingToolId, setSavingToolId] = useState<string | null>(null);
  const [togglingToolId, setTogglingToolId] = useState<string | null>(null);

  useEffect(() => {
    if (settings?.customInstructions !== undefined) {
      setCustomInstructions(settings.customInstructions);
    }
  }, [settings?.customInstructions]);

  useEffect(() => {
    if (!settings?.tools) {
      return;
    }
    setAddonDrafts((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const tool of settings.tools) {
        if (!(tool.toolId in next)) {
          next[tool.toolId] = tool.descriptionAddon;
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [settings?.tools]);

  if (settings === undefined) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading assistant settings...</p>
      </div>
    );
  }

  const characterCount = customInstructions.length;
  const trimmedLength = customInstructions.trim().length;
  const isOverLimit = characterCount > MAX_CUSTOM_INSTRUCTIONS_LENGTH;
  const overflowCount = characterCount - MAX_CUSTOM_INSTRUCTIONS_LENGTH;

  const handleSave = async () => {
    if (trimmedLength === 0) {
      toast.error("Custom instructions cannot be empty.");
      return;
    }

    if (isOverLimit) {
      toast.error(
        `Custom instructions are too long by ${overflowCount.toLocaleString()} characters. Please shorten them to ${MAX_CUSTOM_INSTRUCTIONS_LENGTH.toLocaleString()} characters or fewer.`,
      );
      return;
    }

    setIsSaving(true);
    try {
      await updateSettings({ customInstructions });
      toast.success("Assistant prompt updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setCustomInstructions(settings.defaultCustomInstructions);
  };

  const handleToggleTool = async (tool: ToolKnowledgeItem, enabled: boolean) => {
    setTogglingToolId(tool.toolId);
    try {
      await updateToolKnowledge({
        toolId: tool.toolId,
        enabled,
      });
      toast.success(enabled ? `${tool.label} enabled` : `${tool.label} disabled`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update tool");
    } finally {
      setTogglingToolId(null);
    }
  };

  const handleSaveAddon = async (tool: ToolKnowledgeItem) => {
    const descriptionAddon = addonDrafts[tool.toolId] ?? "";
    if (descriptionAddon.length > MAX_DESCRIPTION_ADDON_LENGTH) {
      toast.error(
        `Additional description is too long by ${(descriptionAddon.length - MAX_DESCRIPTION_ADDON_LENGTH).toLocaleString()} characters.`,
      );
      return;
    }

    setSavingToolId(tool.toolId);
    try {
      const result = await updateToolKnowledge({
        toolId: tool.toolId,
        descriptionAddon,
      });
      setAddonDrafts((previous) => ({
        ...previous,
        [tool.toolId]: result.tool.descriptionAddon,
      }));
      toast.success(`${tool.label} knowledge updated`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save tool knowledge");
    } finally {
      setSavingToolId(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Assistant settings</h1>
          <p className="text-muted-foreground">
            Customize the assistant prompt and which tools it can use. Core safety rules stay locked.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isTech ? (
            <Button asChild variant="outline">
              <Link to="/assistant-conversations">
                <MessagesSquare className="me-2 h-4 w-4" />
                View all conversations
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to="/assistant-test">Open assistant</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Editable prompt</CardTitle>
          <CardDescription>
            Brand voice, tone, and high-level behavior. User context and private memory are injected
            automatically at runtime. Maximum {MAX_CUSTOM_INSTRUCTIONS_LENGTH.toLocaleString()}{" "}
            characters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor="assistant-custom-prompt">Custom instructions</Label>
              <p
                className={cn(
                  "text-xs tabular-nums",
                  isOverLimit ? "font-medium text-destructive" : "text-muted-foreground",
                )}
              >
                {characterCount.toLocaleString()} / {MAX_CUSTOM_INSTRUCTIONS_LENGTH.toLocaleString()}
              </p>
            </div>
            <Textarea
              id="assistant-custom-prompt"
              value={customInstructions}
              onChange={(event) => setCustomInstructions(event.target.value)}
              rows={16}
              aria-invalid={isOverLimit}
              className={cn(
                "min-h-[320px] font-mono text-sm",
                isOverLimit && "border-destructive focus-visible:ring-destructive",
              )}
            />
            {isOverLimit ? (
              <p className="text-sm text-destructive" role="alert">
                Too long by {overflowCount.toLocaleString()} characters. Shorten the prompt to{" "}
                {MAX_CUSTOM_INSTRUCTIONS_LENGTH.toLocaleString()} characters or fewer to save.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || isOverLimit || trimmedLength === 0}
            >
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={handleReset}>
              Reset to default
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Knowledge</CardTitle>
          <CardDescription>
            Tools the assistant can call, plus spreadsheet knowledge files. Disable a tool to hide it
            from the model, review its base description, and add extra guidance. Upload Excel/CSV
            files to build a searchable knowledge base (assistant integration comes later).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-medium">Tools</h3>
              <p className="text-sm text-muted-foreground">
                Enable or disable tools and append guidance that is merged into their descriptions at
                runtime.
              </p>
            </div>
            <Accordion type="multiple" className="w-full">
              {settings.tools.map((tool) => {
                const draft = addonDrafts[tool.toolId] ?? tool.descriptionAddon;
                const addonCount = draft.length;
                const addonOverLimit = addonCount > MAX_DESCRIPTION_ADDON_LENGTH;
                const isDirty = draft !== tool.descriptionAddon;
                const isSavingAddon = savingToolId === tool.toolId;
                const isToggling = togglingToolId === tool.toolId;

                return (
                  <AccordionItem key={tool.toolId} value={tool.toolId}>
                    <div className="flex items-center gap-3 border-b-0 py-2">
                      <div className="min-w-0 flex-1">
                        <AccordionTrigger className="py-2 hover:no-underline">
                          <div className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                            <span className="font-medium">{tool.label}</span>
                            <span className="text-sm font-normal text-muted-foreground">
                              {tool.summary}
                            </span>
                          </div>
                        </AccordionTrigger>
                      </div>
                      <div
                        className="flex shrink-0 items-center gap-2 pr-1"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Label
                          htmlFor={`tool-enabled-${tool.toolId}`}
                          className="text-xs text-muted-foreground"
                        >
                          {tool.enabled ? "Enabled" : "Disabled"}
                        </Label>
                        <Switch
                          id={`tool-enabled-${tool.toolId}`}
                          checked={tool.enabled}
                          disabled={isToggling}
                          onCheckedChange={(checked) => void handleToggleTool(tool, checked)}
                        />
                      </div>
                    </div>
                    <AccordionContent className="space-y-4 pb-4">
                      <div className="space-y-2">
                        <Label htmlFor={`tool-default-${tool.toolId}`}>Base description</Label>
                        <Textarea
                          id={`tool-default-${tool.toolId}`}
                          readOnly
                          value={tool.defaultDescription}
                          rows={4}
                          className="cursor-default bg-muted/40 font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-end justify-between gap-2">
                          <Label htmlFor={`tool-addon-${tool.toolId}`}>Additional guidance</Label>
                          <p
                            className={cn(
                              "text-xs tabular-nums",
                              addonOverLimit
                                ? "font-medium text-destructive"
                                : "text-muted-foreground",
                            )}
                          >
                            {addonCount.toLocaleString()} /{" "}
                            {MAX_DESCRIPTION_ADDON_LENGTH.toLocaleString()}
                          </p>
                        </div>
                        <Textarea
                          id={`tool-addon-${tool.toolId}`}
                          value={draft}
                          onChange={(event) =>
                            setAddonDrafts((previous) => ({
                              ...previous,
                              [tool.toolId]: event.target.value,
                            }))
                          }
                          rows={5}
                          aria-invalid={addonOverLimit}
                          placeholder="Optional notes appended to the tool description for the model…"
                          className={cn(
                            "font-mono text-sm",
                            addonOverLimit && "border-destructive focus-visible:ring-destructive",
                          )}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleSaveAddon(tool)}
                            disabled={!isDirty || isSavingAddon || addonOverLimit}
                          >
                            {isSavingAddon ? "Saving..." : "Save guidance"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!isDirty || isSavingAddon}
                            onClick={() =>
                              setAddonDrafts((previous) => ({
                                ...previous,
                                [tool.toolId]: tool.descriptionAddon,
                              }))
                            }
                          >
                            Discard
                          </Button>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>

          <Separator />

          <KnowledgeFilesSection />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Locked instructions</CardTitle>
          <CardDescription>
            Tool usage, subscription rules, security boundaries, and memory behavior. These cannot be
            edited here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            readOnly
            value={settings.fixedInstructions}
            rows={20}
            className="min-h-[360px] cursor-default bg-muted/40 font-mono text-sm"
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default AssistantSettings;
