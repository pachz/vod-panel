import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MessagesSquare, Plus, Trash2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { KnowledgeFilesSection } from "@/components/assistant/KnowledgeFilesSection";
import { NamedInstructionsSection } from "@/components/assistant/NamedInstructionsSection";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  MAX_STARTER_SUGGESTION_LENGTH,
  MAX_STARTER_SUGGESTIONS,
  MAX_WELCOME_MESSAGE_LENGTH,
} from "../../convex/assistant/greeting";

const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 20_000;
const MAX_DESCRIPTION_ADDON_LENGTH = 4_000;
const MAX_COURSES_CATALOG_MESSAGE_LENGTH = 500;
const MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH = 500;
const MAX_CLEANUP_PROMPT_LENGTH = 20_000;

type AssistantSettingsData = FunctionReturnType<typeof api.assistant.settings.getAssistantSettings>;
type ToolKnowledgeItem = AssistantSettingsData["tools"][number];
type GreetingSuggestionDraft = {
  id: string;
  textEn: string;
  textAr: string;
};

function newSuggestionDraftId(): string {
  return crypto.randomUUID();
}

function draftsFromSuggestions(
  suggestions: Array<{ textEn: string; textAr: string }>,
): GreetingSuggestionDraft[] {
  return suggestions.map((item) => ({
    id: newSuggestionDraftId(),
    textEn: item.textEn,
    textAr: item.textAr,
  }));
}

const AssistantSettings = () => {
  const currentUser = useQuery(api.user.getCurrentUser);
  const settings = useQuery(api.assistant.settings.getAssistantSettings);
  const updateSettings = useMutation(api.assistant.settings.updateAssistantSettings);
  const updateToolKnowledge = useMutation(api.assistant.settings.updateAssistantToolKnowledge);
  const updateCoursesCatalogMessages = useMutation(
    api.assistant.settings.updateCoursesCatalogMessages,
  );
  const updateWhatsAppSupportMessages = useMutation(
    api.assistant.settings.updateWhatsAppSupportMessages,
  );
  const updateAssistantGreeting = useMutation(api.assistant.settings.updateAssistantGreeting);
  const updateCleanupSettings = useMutation(api.assistant.settings.updateCleanupSettings);
  const updateWidgetVisibility = useMutation(api.assistant.settings.updateAssistantWidgetVisibility);
  const isTech = currentUser?.isTech ?? false;
  const [customInstructions, setCustomInstructions] = useState("");
  const [addonDrafts, setAddonDrafts] = useState<Record<string, string>>({});
  const [catalogMessageEn, setCatalogMessageEn] = useState("");
  const [catalogMessageAr, setCatalogMessageAr] = useState("");
  const [whatsAppMessageEn, setWhatsAppMessageEn] = useState("");
  const [whatsAppMessageAr, setWhatsAppMessageAr] = useState("");
  const [welcomeMessageEn, setWelcomeMessageEn] = useState("");
  const [welcomeMessageAr, setWelcomeMessageAr] = useState("");
  const [suggestionDrafts, setSuggestionDrafts] = useState<GreetingSuggestionDraft[]>([]);
  const [cleanupCtaSystem, setCleanupCtaSystem] = useState("");
  const [cleanupStreamSystem, setCleanupStreamSystem] = useState("");
  const [cleanupCtaUserTemplate, setCleanupCtaUserTemplate] = useState("");
  const [cleanupStreamUserTemplate, setCleanupStreamUserTemplate] = useState("");
  const [cleanupModel, setCleanupModel] = useState("");
  const [cleanupCtaTemperature, setCleanupCtaTemperature] = useState("0");
  const [isSaving, setIsSaving] = useState(false);
  const [savingToolId, setSavingToolId] = useState<string | null>(null);
  const [togglingToolId, setTogglingToolId] = useState<string | null>(null);
  const [isSavingCatalog, setIsSavingCatalog] = useState(false);
  const [isSavingWhatsApp, setIsSavingWhatsApp] = useState(false);
  const [isSavingGreeting, setIsSavingGreeting] = useState(false);
  const [isSavingCleanup, setIsSavingCleanup] = useState(false);
  const [togglingWidget, setTogglingWidget] = useState<"admins" | "users" | null>(null);

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

  useEffect(() => {
    if (!settings?.coursesCatalog) {
      return;
    }
    setCatalogMessageEn(settings.coursesCatalog.messageEn);
    setCatalogMessageAr(settings.coursesCatalog.messageAr);
  }, [settings?.coursesCatalog]);

  useEffect(() => {
    if (!settings?.whatsAppSupport) {
      return;
    }
    setWhatsAppMessageEn(settings.whatsAppSupport.messageEn);
    setWhatsAppMessageAr(settings.whatsAppSupport.messageAr);
  }, [settings?.whatsAppSupport]);

  useEffect(() => {
    if (!settings?.greeting) {
      return;
    }
    setWelcomeMessageEn(settings.greeting.welcomeMessageEn);
    setWelcomeMessageAr(settings.greeting.welcomeMessageAr);
    setSuggestionDrafts(draftsFromSuggestions(settings.greeting.starterSuggestions));
  }, [
    settings?.greeting?.welcomeMessageEn,
    settings?.greeting?.welcomeMessageAr,
    JSON.stringify(settings?.greeting?.starterSuggestions ?? null),
  ]);

  useEffect(() => {
    if (!settings?.cleanup) {
      return;
    }
    setCleanupCtaSystem(settings.cleanup.ctaSystemPrompt);
    setCleanupStreamSystem(settings.cleanup.streamSystemPrompt);
    setCleanupCtaUserTemplate(settings.cleanup.ctaUserPromptTemplate);
    setCleanupStreamUserTemplate(settings.cleanup.streamUserPromptTemplate);
    setCleanupModel(settings.cleanup.model);
    setCleanupCtaTemperature(String(settings.cleanup.ctaTemperature));
  }, [settings?.cleanup]);

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

  const handleToggleWidget = async (
    field: "admins" | "users",
    checked: boolean,
  ) => {
    setTogglingWidget(field);
    try {
      await updateWidgetVisibility(
        field === "admins" ? { showToAdmins: checked } : { showToUsers: checked },
      );
      toast.success(
        field === "admins"
          ? checked
            ? "Chat widget enabled for admins"
            : "Chat widget disabled for admins"
          : checked
            ? "Chat widget enabled for users"
            : "Chat widget disabled for users",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update widget visibility");
    } finally {
      setTogglingWidget(null);
    }
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

  const handleSaveCatalogMessages = async () => {
    if (catalogMessageEn.length > MAX_COURSES_CATALOG_MESSAGE_LENGTH) {
      toast.error(
        `English catalog message is too long by ${(catalogMessageEn.length - MAX_COURSES_CATALOG_MESSAGE_LENGTH).toLocaleString()} characters.`,
      );
      return;
    }
    if (catalogMessageAr.length > MAX_COURSES_CATALOG_MESSAGE_LENGTH) {
      toast.error(
        `Arabic catalog message is too long by ${(catalogMessageAr.length - MAX_COURSES_CATALOG_MESSAGE_LENGTH).toLocaleString()} characters.`,
      );
      return;
    }

    setIsSavingCatalog(true);
    try {
      const result = await updateCoursesCatalogMessages({
        messageEn: catalogMessageEn,
        messageAr: catalogMessageAr,
      });
      setCatalogMessageEn(result.coursesCatalog.messageEn);
      setCatalogMessageAr(result.coursesCatalog.messageAr);
      toast.success("Courses catalog messages updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save catalog messages",
      );
    } finally {
      setIsSavingCatalog(false);
    }
  };

  const handleSaveWhatsAppMessages = async () => {
    if (whatsAppMessageEn.length > MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH) {
      toast.error(
        `English WhatsApp support message is too long by ${(whatsAppMessageEn.length - MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH).toLocaleString()} characters.`,
      );
      return;
    }
    if (whatsAppMessageAr.length > MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH) {
      toast.error(
        `Arabic WhatsApp support message is too long by ${(whatsAppMessageAr.length - MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH).toLocaleString()} characters.`,
      );
      return;
    }

    setIsSavingWhatsApp(true);
    try {
      const result = await updateWhatsAppSupportMessages({
        messageEn: whatsAppMessageEn,
        messageAr: whatsAppMessageAr,
      });
      setWhatsAppMessageEn(result.whatsAppSupport.messageEn);
      setWhatsAppMessageAr(result.whatsAppSupport.messageAr);
      toast.success("WhatsApp support messages updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save WhatsApp support messages",
      );
    } finally {
      setIsSavingWhatsApp(false);
    }
  };

  const handleSaveGreeting = async () => {
    if (welcomeMessageEn.length > MAX_WELCOME_MESSAGE_LENGTH) {
      toast.error(
        `English welcome message is too long by ${(welcomeMessageEn.length - MAX_WELCOME_MESSAGE_LENGTH).toLocaleString()} characters.`,
      );
      return;
    }
    if (welcomeMessageAr.length > MAX_WELCOME_MESSAGE_LENGTH) {
      toast.error(
        `Arabic welcome message is too long by ${(welcomeMessageAr.length - MAX_WELCOME_MESSAGE_LENGTH).toLocaleString()} characters.`,
      );
      return;
    }
    if (suggestionDrafts.length > MAX_STARTER_SUGGESTIONS) {
      toast.error(`You can add at most ${MAX_STARTER_SUGGESTIONS} starter buttons.`);
      return;
    }

    for (const [index, item] of suggestionDrafts.entries()) {
      const textEn = item.textEn.trim();
      const textAr = item.textAr.trim();
      if (textEn.length === 0 && textAr.length === 0) {
        continue;
      }
      if (textEn.length === 0 || textAr.length === 0) {
        toast.error(`Starter button ${index + 1} needs both English and Arabic text.`);
        return;
      }
      if (textEn.length > MAX_STARTER_SUGGESTION_LENGTH) {
        toast.error(
          `English starter button ${index + 1} is too long by ${(textEn.length - MAX_STARTER_SUGGESTION_LENGTH).toLocaleString()} characters.`,
        );
        return;
      }
      if (textAr.length > MAX_STARTER_SUGGESTION_LENGTH) {
        toast.error(
          `Arabic starter button ${index + 1} is too long by ${(textAr.length - MAX_STARTER_SUGGESTION_LENGTH).toLocaleString()} characters.`,
        );
        return;
      }
    }

    setIsSavingGreeting(true);
    try {
      const result = await updateAssistantGreeting({
        welcomeMessageEn,
        welcomeMessageAr,
        starterSuggestions: suggestionDrafts.map((item) => ({
          textEn: item.textEn,
          textAr: item.textAr,
        })),
      });
      setWelcomeMessageEn(result.greeting.welcomeMessageEn);
      setWelcomeMessageAr(result.greeting.welcomeMessageAr);
      setSuggestionDrafts(draftsFromSuggestions(result.greeting.starterSuggestions));
      toast.success("Welcome message and starter buttons updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save welcome settings",
      );
    } finally {
      setIsSavingGreeting(false);
    }
  };

  const parsedCleanupTemperature = Number(cleanupCtaTemperature);
  const cleanupTemperatureValid =
    Number.isFinite(parsedCleanupTemperature) &&
    parsedCleanupTemperature >= 0 &&
    parsedCleanupTemperature <= 2;

  const handleSaveCleanup = async () => {
    const prompts = [
      ["CTA system prompt", cleanupCtaSystem],
      ["Rewrite system prompt", cleanupStreamSystem],
      ["CTA user prompt template", cleanupCtaUserTemplate],
      ["Rewrite user prompt template", cleanupStreamUserTemplate],
    ] as const;

    for (const [label, value] of prompts) {
      if (value.trim().length === 0) {
        toast.error(`${label} cannot be empty.`);
        return;
      }
      if (value.length > MAX_CLEANUP_PROMPT_LENGTH) {
        toast.error(
          `${label} is too long by ${(value.length - MAX_CLEANUP_PROMPT_LENGTH).toLocaleString()} characters.`,
        );
        return;
      }
    }

    if (!cleanupCtaUserTemplate.includes("{{draftText}}")) {
      toast.error("CTA user prompt template must include {{draftText}}.");
      return;
    }
    if (!cleanupCtaUserTemplate.includes("{{inventoryJson}}")) {
      toast.error("CTA user prompt template must include {{inventoryJson}}.");
      return;
    }
    if (!cleanupStreamUserTemplate.includes("{{draftText}}")) {
      toast.error("Rewrite user prompt template must include {{draftText}}.");
      return;
    }
    if (!cleanupTemperatureValid) {
      toast.error("CTA temperature must be a number between 0 and 2.");
      return;
    }

    setIsSavingCleanup(true);
    try {
      const result = await updateCleanupSettings({
        ctaSystemPrompt: cleanupCtaSystem,
        streamSystemPrompt: cleanupStreamSystem,
        ctaUserPromptTemplate: cleanupCtaUserTemplate,
        streamUserPromptTemplate: cleanupStreamUserTemplate,
        model: cleanupModel,
        ctaTemperature: parsedCleanupTemperature,
      });
      setCleanupCtaSystem(result.cleanup.ctaSystemPrompt);
      setCleanupStreamSystem(result.cleanup.streamSystemPrompt);
      setCleanupCtaUserTemplate(result.cleanup.ctaUserPromptTemplate);
      setCleanupStreamUserTemplate(result.cleanup.streamUserPromptTemplate);
      setCleanupModel(result.cleanup.model);
      setCleanupCtaTemperature(String(result.cleanup.ctaTemperature));
      toast.success("Second-pass AI settings updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save cleanup settings");
    } finally {
      setIsSavingCleanup(false);
    }
  };

  const catalogDefaults = settings.coursesCatalog;
  const catalogDirty =
    catalogMessageEn !== catalogDefaults.messageEn ||
    catalogMessageAr !== catalogDefaults.messageAr;
  const catalogEnOverLimit = catalogMessageEn.length > MAX_COURSES_CATALOG_MESSAGE_LENGTH;
  const catalogArOverLimit = catalogMessageAr.length > MAX_COURSES_CATALOG_MESSAGE_LENGTH;

  const whatsAppDefaults = settings.whatsAppSupport;
  const whatsAppDirty =
    whatsAppMessageEn !== whatsAppDefaults.messageEn ||
    whatsAppMessageAr !== whatsAppDefaults.messageAr;
  const whatsAppEnOverLimit = whatsAppMessageEn.length > MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH;
  const whatsAppArOverLimit = whatsAppMessageAr.length > MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH;

  const greetingDefaults = settings.greeting;
  const greetingSuggestionsDirty =
    suggestionDrafts.length !== greetingDefaults.starterSuggestions.length ||
    suggestionDrafts.some((item, index) => {
      const saved = greetingDefaults.starterSuggestions[index];
      return !saved || item.textEn !== saved.textEn || item.textAr !== saved.textAr;
    });
  const greetingDirty =
    welcomeMessageEn !== greetingDefaults.welcomeMessageEn ||
    welcomeMessageAr !== greetingDefaults.welcomeMessageAr ||
    greetingSuggestionsDirty;
  const welcomeEnOverLimit = welcomeMessageEn.length > MAX_WELCOME_MESSAGE_LENGTH;
  const welcomeArOverLimit = welcomeMessageAr.length > MAX_WELCOME_MESSAGE_LENGTH;
  const greetingSuggestionsOverLimit = suggestionDrafts.some(
    (item) =>
      item.textEn.length > MAX_STARTER_SUGGESTION_LENGTH ||
      item.textAr.length > MAX_STARTER_SUGGESTION_LENGTH,
  );
  const greetingOverLimit =
    welcomeEnOverLimit || welcomeArOverLimit || greetingSuggestionsOverLimit;

  const cleanupDefaults = settings.cleanup;
  const cleanupDirty =
    cleanupCtaSystem !== cleanupDefaults.ctaSystemPrompt ||
    cleanupStreamSystem !== cleanupDefaults.streamSystemPrompt ||
    cleanupCtaUserTemplate !== cleanupDefaults.ctaUserPromptTemplate ||
    cleanupStreamUserTemplate !== cleanupDefaults.streamUserPromptTemplate ||
    cleanupModel !== cleanupDefaults.model ||
    cleanupCtaTemperature !== String(cleanupDefaults.ctaTemperature);
  const cleanupCtaSystemOver =
    cleanupCtaSystem.length > MAX_CLEANUP_PROMPT_LENGTH;
  const cleanupStreamSystemOver =
    cleanupStreamSystem.length > MAX_CLEANUP_PROMPT_LENGTH;
  const cleanupCtaUserOver =
    cleanupCtaUserTemplate.length > MAX_CLEANUP_PROMPT_LENGTH;
  const cleanupStreamUserOver =
    cleanupStreamUserTemplate.length > MAX_CLEANUP_PROMPT_LENGTH;
  const cleanupOverLimit =
    cleanupCtaSystemOver ||
    cleanupStreamSystemOver ||
    cleanupCtaUserOver ||
    cleanupStreamUserOver;

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
          <CardTitle>Chat widget</CardTitle>
          <CardDescription>
            The assistant appears as a chat button in the bottom-right corner. Tech users always see
            it. Turn these on to show it to admins or members as well.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="show-widget-admins">Show widget to admins</Label>
              <p className="text-sm text-muted-foreground">
                Admin accounts see the chat widget on every page.
              </p>
            </div>
            <Switch
              id="show-widget-admins"
              checked={settings.widget?.showToAdmins ?? false}
              disabled={togglingWidget === "admins"}
              onCheckedChange={(checked) => void handleToggleWidget("admins", checked)}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="show-widget-users">Show widget to users</Label>
              <p className="text-sm text-muted-foreground">
                Members see the chat widget on every page.
              </p>
            </div>
            <Switch
              id="show-widget-users"
              checked={settings.widget?.showToUsers ?? false}
              disabled={togglingWidget === "users"}
              onCheckedChange={(checked) => void handleToggleWidget("users", checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Welcome & starter buttons</CardTitle>
          <CardDescription>
            Every new conversation starts with this welcome message. Suggested reply buttons appear
            only until the user sends their first message. You can add 1 to {MAX_STARTER_SUGGESTIONS}{" "}
            buttons, or none.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor="welcome-message-en">English welcome message</Label>
              <p
                className={cn(
                  "text-xs tabular-nums",
                  welcomeEnOverLimit ? "font-medium text-destructive" : "text-muted-foreground",
                )}
              >
                {welcomeMessageEn.length.toLocaleString()} /{" "}
                {MAX_WELCOME_MESSAGE_LENGTH.toLocaleString()}
              </p>
            </div>
            <Textarea
              id="welcome-message-en"
              value={welcomeMessageEn}
              onChange={(event) => setWelcomeMessageEn(event.target.value)}
              rows={3}
              dir="ltr"
              aria-invalid={welcomeEnOverLimit}
              placeholder={greetingDefaults.defaultWelcomeMessageEn}
              className={cn(
                "text-sm",
                welcomeEnOverLimit && "border-destructive focus-visible:ring-destructive",
              )}
            />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor="welcome-message-ar">Arabic welcome message</Label>
              <p
                className={cn(
                  "text-xs tabular-nums",
                  welcomeArOverLimit ? "font-medium text-destructive" : "text-muted-foreground",
                )}
              >
                {welcomeMessageAr.length.toLocaleString()} /{" "}
                {MAX_WELCOME_MESSAGE_LENGTH.toLocaleString()}
              </p>
            </div>
            <Textarea
              id="welcome-message-ar"
              value={welcomeMessageAr}
              onChange={(event) => setWelcomeMessageAr(event.target.value)}
              rows={3}
              dir="rtl"
              aria-invalid={welcomeArOverLimit}
              placeholder={greetingDefaults.defaultWelcomeMessageAr}
              className={cn(
                "text-sm",
                welcomeArOverLimit && "border-destructive focus-visible:ring-destructive",
              )}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank and save to use the built-in default.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Starter buttons</h3>
                <p className="text-sm text-muted-foreground">
                  {suggestionDrafts.length} / {MAX_STARTER_SUGGESTIONS} buttons
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={suggestionDrafts.length >= MAX_STARTER_SUGGESTIONS || isSavingGreeting}
                onClick={() =>
                  setSuggestionDrafts((previous) => [
                    ...previous,
                    { id: newSuggestionDraftId(), textEn: "", textAr: "" },
                  ])
                }
              >
                <Plus className="me-1.5 h-4 w-4" />
                Add button
              </Button>
            </div>

            {suggestionDrafts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                No starter buttons. New conversations will show the welcome message only.
              </p>
            ) : (
              <div className="space-y-3">
                {suggestionDrafts.map((item, index) => {
                  const enOver = item.textEn.length > MAX_STARTER_SUGGESTION_LENGTH;
                  const arOver = item.textAr.length > MAX_STARTER_SUGGESTION_LENGTH;
                  return (
                    <div
                      key={item.id}
                      className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">Button {index + 1}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove starter button ${index + 1}`}
                          disabled={isSavingGreeting}
                          onClick={() =>
                            setSuggestionDrafts((previous) =>
                              previous.filter((suggestion) => suggestion.id !== item.id),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-end justify-between gap-2">
                            <Label htmlFor={`starter-en-${item.id}`}>English</Label>
                            <p
                              className={cn(
                                "text-xs tabular-nums",
                                enOver ? "font-medium text-destructive" : "text-muted-foreground",
                              )}
                            >
                              {item.textEn.length.toLocaleString()} /{" "}
                              {MAX_STARTER_SUGGESTION_LENGTH.toLocaleString()}
                            </p>
                          </div>
                          <Input
                            id={`starter-en-${item.id}`}
                            value={item.textEn}
                            onChange={(event) =>
                              setSuggestionDrafts((previous) =>
                                previous.map((suggestion) =>
                                  suggestion.id === item.id
                                    ? { ...suggestion, textEn: event.target.value }
                                    : suggestion,
                                ),
                              )
                            }
                            dir="ltr"
                            aria-invalid={enOver}
                            className={cn(
                              "text-sm",
                              enOver && "border-destructive focus-visible:ring-destructive",
                            )}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-end justify-between gap-2">
                            <Label htmlFor={`starter-ar-${item.id}`}>Arabic</Label>
                            <p
                              className={cn(
                                "text-xs tabular-nums",
                                arOver ? "font-medium text-destructive" : "text-muted-foreground",
                              )}
                            >
                              {item.textAr.length.toLocaleString()} /{" "}
                              {MAX_STARTER_SUGGESTION_LENGTH.toLocaleString()}
                            </p>
                          </div>
                          <Input
                            id={`starter-ar-${item.id}`}
                            value={item.textAr}
                            onChange={(event) =>
                              setSuggestionDrafts((previous) =>
                                previous.map((suggestion) =>
                                  suggestion.id === item.id
                                    ? { ...suggestion, textAr: event.target.value }
                                    : suggestion,
                                ),
                              )
                            }
                            dir="rtl"
                            aria-invalid={arOver}
                            className={cn(
                              "text-sm",
                              arOver && "border-destructive focus-visible:ring-destructive",
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleSaveGreeting()}
              disabled={!greetingDirty || isSavingGreeting || greetingOverLimit}
            >
              {isSavingGreeting ? "Saving..." : "Save greeting"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!greetingDirty || isSavingGreeting}
              onClick={() => {
                setWelcomeMessageEn(greetingDefaults.welcomeMessageEn);
                setWelcomeMessageAr(greetingDefaults.welcomeMessageAr);
                setSuggestionDrafts(draftsFromSuggestions(greetingDefaults.starterSuggestions));
              }}
            >
              Discard
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSavingGreeting}
              onClick={() => {
                setWelcomeMessageEn(greetingDefaults.defaultWelcomeMessageEn);
                setWelcomeMessageAr(greetingDefaults.defaultWelcomeMessageAr);
                setSuggestionDrafts(
                  draftsFromSuggestions(greetingDefaults.defaultStarterSuggestions),
                );
              }}
            >
              Reset to default
            </Button>
          </div>
        </CardContent>
      </Card>

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
          <CardTitle>Second-pass cleanup AI</CardTitle>
          <CardDescription>
            After the main assistant drafts a reply with tools, a second model trims CTAs and rewrites
            the user-facing text. Leave the model blank to use the env default (
            {cleanupDefaults.defaultModel}). User prompt templates support{" "}
            <code className="text-xs">{"{{draftText}}"}</code> and{" "}
            <code className="text-xs">{"{{inventoryJson}}"}</code> (CTA step only).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cleanup-model">Model override</Label>
              <Input
                id="cleanup-model"
                value={cleanupModel}
                onChange={(event) => setCleanupModel(event.target.value)}
                placeholder={cleanupDefaults.defaultModel}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Used for CTA decisions and the rewritten reply stream. Blank ={" "}
                {cleanupDefaults.defaultModel}.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cleanup-cta-temperature">CTA decision temperature</Label>
              <Input
                id="cleanup-cta-temperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={cleanupCtaTemperature}
                onChange={(event) => setCleanupCtaTemperature(event.target.value)}
                aria-invalid={!cleanupTemperatureValid}
                className={cn(
                  "font-mono text-sm",
                  !cleanupTemperatureValid && "border-destructive focus-visible:ring-destructive",
                )}
              />
              <p className="text-xs text-muted-foreground">
                0–2. Default {cleanupDefaults.defaultCtaTemperature}.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor="cleanup-cta-system">CTA system prompt</Label>
              <p
                className={cn(
                  "text-xs tabular-nums",
                  cleanupCtaSystemOver ? "font-medium text-destructive" : "text-muted-foreground",
                )}
              >
                {cleanupCtaSystem.length.toLocaleString()} /{" "}
                {MAX_CLEANUP_PROMPT_LENGTH.toLocaleString()}
              </p>
            </div>
            <Textarea
              id="cleanup-cta-system"
              value={cleanupCtaSystem}
              onChange={(event) => setCleanupCtaSystem(event.target.value)}
              rows={8}
              aria-invalid={cleanupCtaSystemOver}
              className={cn(
                "font-mono text-sm",
                cleanupCtaSystemOver && "border-destructive focus-visible:ring-destructive",
              )}
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor="cleanup-cta-user">CTA user prompt template</Label>
              <p
                className={cn(
                  "text-xs tabular-nums",
                  cleanupCtaUserOver ? "font-medium text-destructive" : "text-muted-foreground",
                )}
              >
                {cleanupCtaUserTemplate.length.toLocaleString()} /{" "}
                {MAX_CLEANUP_PROMPT_LENGTH.toLocaleString()}
              </p>
            </div>
            <Textarea
              id="cleanup-cta-user"
              value={cleanupCtaUserTemplate}
              onChange={(event) => setCleanupCtaUserTemplate(event.target.value)}
              rows={8}
              aria-invalid={cleanupCtaUserOver}
              className={cn(
                "font-mono text-sm",
                cleanupCtaUserOver && "border-destructive focus-visible:ring-destructive",
              )}
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor="cleanup-stream-system">Rewrite system prompt</Label>
              <p
                className={cn(
                  "text-xs tabular-nums",
                  cleanupStreamSystemOver
                    ? "font-medium text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {cleanupStreamSystem.length.toLocaleString()} /{" "}
                {MAX_CLEANUP_PROMPT_LENGTH.toLocaleString()}
              </p>
            </div>
            <Textarea
              id="cleanup-stream-system"
              value={cleanupStreamSystem}
              onChange={(event) => setCleanupStreamSystem(event.target.value)}
              rows={8}
              aria-invalid={cleanupStreamSystemOver}
              className={cn(
                "font-mono text-sm",
                cleanupStreamSystemOver && "border-destructive focus-visible:ring-destructive",
              )}
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor="cleanup-stream-user">Rewrite user prompt template</Label>
              <p
                className={cn(
                  "text-xs tabular-nums",
                  cleanupStreamUserOver
                    ? "font-medium text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {cleanupStreamUserTemplate.length.toLocaleString()} /{" "}
                {MAX_CLEANUP_PROMPT_LENGTH.toLocaleString()}
              </p>
            </div>
            <Textarea
              id="cleanup-stream-user"
              value={cleanupStreamUserTemplate}
              onChange={(event) => setCleanupStreamUserTemplate(event.target.value)}
              rows={6}
              aria-invalid={cleanupStreamUserOver}
              className={cn(
                "font-mono text-sm",
                cleanupStreamUserOver && "border-destructive focus-visible:ring-destructive",
              )}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleSaveCleanup()}
              disabled={
                !cleanupDirty ||
                isSavingCleanup ||
                cleanupOverLimit ||
                !cleanupTemperatureValid
              }
            >
              {isSavingCleanup ? "Saving..." : "Save second-pass settings"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!cleanupDirty || isSavingCleanup}
              onClick={() => {
                setCleanupCtaSystem(cleanupDefaults.ctaSystemPrompt);
                setCleanupStreamSystem(cleanupDefaults.streamSystemPrompt);
                setCleanupCtaUserTemplate(cleanupDefaults.ctaUserPromptTemplate);
                setCleanupStreamUserTemplate(cleanupDefaults.streamUserPromptTemplate);
                setCleanupModel(cleanupDefaults.model);
                setCleanupCtaTemperature(String(cleanupDefaults.ctaTemperature));
              }}
            >
              Discard
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSavingCleanup}
              onClick={() => {
                setCleanupCtaSystem(cleanupDefaults.defaultCtaSystemPrompt);
                setCleanupStreamSystem(cleanupDefaults.defaultStreamSystemPrompt);
                setCleanupCtaUserTemplate(cleanupDefaults.defaultCtaUserPromptTemplate);
                setCleanupStreamUserTemplate(cleanupDefaults.defaultStreamUserPromptTemplate);
                setCleanupModel("");
                setCleanupCtaTemperature(String(cleanupDefaults.defaultCtaTemperature));
              }}
            >
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
                      {tool.toolId === "getNamedInstructions" ? (
                        <NamedInstructionsSection />
                      ) : null}
                      {tool.toolId === "showCoursesCatalog" ? (
                        <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
                          <div className="space-y-1">
                            <h4 className="text-sm font-medium">Fixed catalog message</h4>
                            <p className="text-sm text-muted-foreground">
                              Shown after the assistant reply with the All courses button. Leave
                              blank and save to use the built-in default. Button labels and URLs are
                              fixed.
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Button: {catalogDefaults.buttonTextEn} /{" "}
                              {catalogDefaults.buttonTextAr} · URLs: {catalogDefaults.urlEn} ·{" "}
                              {catalogDefaults.urlAr}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-end justify-between gap-2">
                              <Label htmlFor="catalog-message-en">English message</Label>
                              <p
                                className={cn(
                                  "text-xs tabular-nums",
                                  catalogEnOverLimit
                                    ? "font-medium text-destructive"
                                    : "text-muted-foreground",
                                )}
                              >
                                {catalogMessageEn.length.toLocaleString()} /{" "}
                                {MAX_COURSES_CATALOG_MESSAGE_LENGTH.toLocaleString()}
                              </p>
                            </div>
                            <Textarea
                              id="catalog-message-en"
                              value={catalogMessageEn}
                              onChange={(event) => setCatalogMessageEn(event.target.value)}
                              rows={3}
                              dir="ltr"
                              aria-invalid={catalogEnOverLimit}
                              placeholder={catalogDefaults.defaultMessageEn}
                              className={cn(
                                "text-sm",
                                catalogEnOverLimit &&
                                  "border-destructive focus-visible:ring-destructive",
                              )}
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-end justify-between gap-2">
                              <Label htmlFor="catalog-message-ar">Arabic message</Label>
                              <p
                                className={cn(
                                  "text-xs tabular-nums",
                                  catalogArOverLimit
                                    ? "font-medium text-destructive"
                                    : "text-muted-foreground",
                                )}
                              >
                                {catalogMessageAr.length.toLocaleString()} /{" "}
                                {MAX_COURSES_CATALOG_MESSAGE_LENGTH.toLocaleString()}
                              </p>
                            </div>
                            <Textarea
                              id="catalog-message-ar"
                              value={catalogMessageAr}
                              onChange={(event) => setCatalogMessageAr(event.target.value)}
                              rows={3}
                              dir="rtl"
                              aria-invalid={catalogArOverLimit}
                              placeholder={catalogDefaults.defaultMessageAr}
                              className={cn(
                                "text-sm",
                                catalogArOverLimit &&
                                  "border-destructive focus-visible:ring-destructive",
                              )}
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void handleSaveCatalogMessages()}
                              disabled={
                                !catalogDirty ||
                                isSavingCatalog ||
                                catalogEnOverLimit ||
                                catalogArOverLimit
                              }
                            >
                              {isSavingCatalog ? "Saving..." : "Save messages"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!catalogDirty || isSavingCatalog}
                              onClick={() => {
                                setCatalogMessageEn(catalogDefaults.messageEn);
                                setCatalogMessageAr(catalogDefaults.messageAr);
                              }}
                            >
                              Discard
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isSavingCatalog}
                              onClick={() => {
                                setCatalogMessageEn(catalogDefaults.defaultMessageEn);
                                setCatalogMessageAr(catalogDefaults.defaultMessageAr);
                              }}
                            >
                              Reset to default
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      {tool.toolId === "sendWhatsAppSupport" ? (
                        <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
                          <div className="space-y-1">
                            <h4 className="text-sm font-medium">Fixed WhatsApp support message</h4>
                            <p className="text-sm text-muted-foreground">
                              Shown after the assistant reply with the WhatsApp button. Leave blank
                              and save to use the built-in default. Button label and base URL are
                              fixed. The model may optionally add a ?text= prefill.
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Button: {whatsAppDefaults.buttonTextEn} /{" "}
                              {whatsAppDefaults.buttonTextAr} · URL: {whatsAppDefaults.url}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-end justify-between gap-2">
                              <Label htmlFor="whatsapp-message-en">English message</Label>
                              <p
                                className={cn(
                                  "text-xs tabular-nums",
                                  whatsAppEnOverLimit
                                    ? "font-medium text-destructive"
                                    : "text-muted-foreground",
                                )}
                              >
                                {whatsAppMessageEn.length.toLocaleString()} /{" "}
                                {MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH.toLocaleString()}
                              </p>
                            </div>
                            <Textarea
                              id="whatsapp-message-en"
                              value={whatsAppMessageEn}
                              onChange={(event) => setWhatsAppMessageEn(event.target.value)}
                              rows={3}
                              dir="ltr"
                              aria-invalid={whatsAppEnOverLimit}
                              placeholder={whatsAppDefaults.defaultMessageEn}
                              className={cn(
                                "text-sm",
                                whatsAppEnOverLimit &&
                                  "border-destructive focus-visible:ring-destructive",
                              )}
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-end justify-between gap-2">
                              <Label htmlFor="whatsapp-message-ar">Arabic message</Label>
                              <p
                                className={cn(
                                  "text-xs tabular-nums",
                                  whatsAppArOverLimit
                                    ? "font-medium text-destructive"
                                    : "text-muted-foreground",
                                )}
                              >
                                {whatsAppMessageAr.length.toLocaleString()} /{" "}
                                {MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH.toLocaleString()}
                              </p>
                            </div>
                            <Textarea
                              id="whatsapp-message-ar"
                              value={whatsAppMessageAr}
                              onChange={(event) => setWhatsAppMessageAr(event.target.value)}
                              rows={3}
                              dir="rtl"
                              aria-invalid={whatsAppArOverLimit}
                              placeholder={whatsAppDefaults.defaultMessageAr}
                              className={cn(
                                "text-sm",
                                whatsAppArOverLimit &&
                                  "border-destructive focus-visible:ring-destructive",
                              )}
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void handleSaveWhatsAppMessages()}
                              disabled={
                                !whatsAppDirty ||
                                isSavingWhatsApp ||
                                whatsAppEnOverLimit ||
                                whatsAppArOverLimit
                              }
                            >
                              {isSavingWhatsApp ? "Saving..." : "Save messages"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!whatsAppDirty || isSavingWhatsApp}
                              onClick={() => {
                                setWhatsAppMessageEn(whatsAppDefaults.messageEn);
                                setWhatsAppMessageAr(whatsAppDefaults.messageAr);
                              }}
                            >
                              Discard
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isSavingWhatsApp}
                              onClick={() => {
                                setWhatsAppMessageEn(whatsAppDefaults.defaultMessageEn);
                                setWhatsAppMessageAr(whatsAppDefaults.defaultMessageAr);
                              }}
                            >
                              Reset to default
                            </Button>
                          </div>
                        </div>
                      ) : null}
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
