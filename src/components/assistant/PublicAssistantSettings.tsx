import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Copy } from "lucide-react";
import { api } from "../../../convex/_generated/api";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  MAX_STARTER_SUGGESTION_LENGTH,
  MAX_STARTER_SUGGESTIONS,
  MAX_WELCOME_MESSAGE_LENGTH,
} from "../../../convex/assistant/greeting";

const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 20_000;
const MAX_DESCRIPTION_ADDON_LENGTH = 4_000;
const MAX_COURSES_CATALOG_MESSAGE_LENGTH = 500;
const MAX_WHATSAPP_SUPPORT_MESSAGE_LENGTH = 500;
const MAX_CLEANUP_PROMPT_LENGTH = 20_000;

type PublicSettingsData = FunctionReturnType<
  typeof api.assistant.publicSettings.getPublicAssistantSettings
>;
type MembersSettingsData = FunctionReturnType<typeof api.assistant.settings.getAssistantSettings>;
type ToolKnowledgeItem = PublicSettingsData["tools"][number];
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

function convexSiteUrl(): string {
  const cloud = import.meta.env.VITE_CONVEX_URL ?? "";
  return cloud.replace(/\.convex\.cloud\/?$/, ".convex.site").replace(/\/$/, "");
}

function CopyFromMembersButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onClick}>
      Copy from members
    </Button>
  );
}

export function PublicAssistantSettings() {
  const settings = useQuery(api.assistant.publicSettings.getPublicAssistantSettings);
  const membersSettings = useQuery(api.assistant.settings.getAssistantSettings);
  const updateEnabled = useMutation(api.assistant.publicSettings.updatePublicAssistantEnabled);
  const updateSettings = useMutation(api.assistant.publicSettings.updatePublicAssistantSettings);
  const updateToolKnowledge = useMutation(
    api.assistant.publicSettings.updatePublicAssistantToolKnowledge,
  );
  const updateCoursesCatalogMessages = useMutation(
    api.assistant.publicSettings.updatePublicCoursesCatalogMessages,
  );
  const updateWhatsAppSupportMessages = useMutation(
    api.assistant.publicSettings.updatePublicWhatsAppSupportMessages,
  );
  const updateAssistantGreeting = useMutation(
    api.assistant.publicSettings.updatePublicAssistantGreeting,
  );
  const updateCleanupSettings = useMutation(
    api.assistant.publicSettings.updatePublicCleanupSettings,
  );
  const copyAllFromMembers = useMutation(
    api.assistant.publicSettings.copyPublicSettingsFromMembers,
  );

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
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [copyingAll, setCopyingAll] = useState(false);

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

  const siteUrl = convexSiteUrl();
  const embedSnippet = useMemo(
    () =>
      `<script src="${siteUrl}/landing/public-assistant/widget.js?v=3" data-lang="ar" async></script>`,
    [siteUrl],
  );
  const nextSnippet = useMemo(
    () => `import Script from "next/script";

export function PublicAssistantWidget() {
  return (
    <Script
      src="${siteUrl}/landing/public-assistant/widget.js?v=3"
      data-lang="ar"
      strategy="afterInteractive"
    />
  );
}`,
    [siteUrl],
  );

  if (settings === undefined) {
    return <p className="text-muted-foreground">Loading public assistant settings...</p>;
  }

  const characterCount = customInstructions.length;
  const trimmedLength = customInstructions.trim().length;
  const isOverLimit = characterCount > MAX_CUSTOM_INSTRUCTIONS_LENGTH;
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
  const greetingOverLimit =
    welcomeMessageEn.length > MAX_WELCOME_MESSAGE_LENGTH ||
    welcomeMessageAr.length > MAX_WELCOME_MESSAGE_LENGTH ||
    suggestionDrafts.some(
      (item) =>
        item.textEn.length > MAX_STARTER_SUGGESTION_LENGTH ||
        item.textAr.length > MAX_STARTER_SUGGESTION_LENGTH,
    );
  const cleanupDefaults = settings.cleanup;
  const parsedCleanupTemperature = Number(cleanupCtaTemperature);
  const cleanupTemperatureValid =
    Number.isFinite(parsedCleanupTemperature) &&
    parsedCleanupTemperature >= 0 &&
    parsedCleanupTemperature <= 2;
  const cleanupDirty =
    cleanupCtaSystem !== cleanupDefaults.ctaSystemPrompt ||
    cleanupStreamSystem !== cleanupDefaults.streamSystemPrompt ||
    cleanupCtaUserTemplate !== cleanupDefaults.ctaUserPromptTemplate ||
    cleanupStreamUserTemplate !== cleanupDefaults.streamUserPromptTemplate ||
    cleanupModel !== cleanupDefaults.model ||
    cleanupCtaTemperature !== String(cleanupDefaults.ctaTemperature);
  const cleanupOverLimit = [
    cleanupCtaSystem,
    cleanupStreamSystem,
    cleanupCtaUserTemplate,
    cleanupStreamUserTemplate,
  ].some((value) => value.length > MAX_CLEANUP_PROMPT_LENGTH);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const applyMembersGreeting = (source: MembersSettingsData) => {
    setWelcomeMessageEn(source.greeting.welcomeMessageEn);
    setWelcomeMessageAr(source.greeting.welcomeMessageAr);
    setSuggestionDrafts(draftsFromSuggestions(source.greeting.starterSuggestions));
  };

  const handleToggleEnabled = async (checked: boolean) => {
    setTogglingEnabled(true);
    try {
      await updateEnabled({ enabled: checked });
      toast.success(checked ? "Public assistant enabled" : "Public assistant disabled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update public assistant");
    } finally {
      setTogglingEnabled(false);
    }
  };

  const handleSave = async () => {
    if (trimmedLength === 0) {
      toast.error("Custom instructions cannot be empty.");
      return;
    }
    if (isOverLimit) {
      toast.error("Custom instructions are too long.");
      return;
    }
    setIsSaving(true);
    try {
      await updateSettings({ customInstructions });
      toast.success("Public assistant prompt updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleTool = async (tool: ToolKnowledgeItem, enabled: boolean) => {
    setTogglingToolId(tool.toolId);
    try {
      await updateToolKnowledge({ toolId: tool.toolId, enabled });
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
      toast.error("Additional description is too long.");
      return;
    }
    setSavingToolId(tool.toolId);
    try {
      const result = await updateToolKnowledge({ toolId: tool.toolId, descriptionAddon });
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
      toast.error(error instanceof Error ? error.message : "Failed to save catalog messages");
    } finally {
      setIsSavingCatalog(false);
    }
  };

  const handleSaveWhatsAppMessages = async () => {
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
      toast.error(error instanceof Error ? error.message : "Failed to save welcome settings");
    } finally {
      setIsSavingGreeting(false);
    }
  };

  const handleSaveCleanup = async () => {
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

  const handleCopyAll = async () => {
    setCopyingAll(true);
    try {
      await copyAllFromMembers({});
      toast.success("Copied members assistant settings into the public assistant");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to copy members settings");
    } finally {
      setCopyingAll(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Public website widget</CardTitle>
          <CardDescription>
            Anonymous visitors on the marketing site get a separate assistant. Subscription, billing,
            and user-memory tools are not available here. Knowledge files and named instruction packs
            are shared with the members assistant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="public-assistant-enabled">Enable public assistant</Label>
              <p className="text-sm text-muted-foreground">
                When off, the landing-site widget hides itself and chat requests are rejected.
              </p>
            </div>
            <Switch
              id="public-assistant-enabled"
              checked={settings.enabled}
              disabled={togglingEnabled}
              onCheckedChange={(checked) => void handleToggleEnabled(checked)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={copyingAll || membersSettings === undefined}
              onClick={() => void handleCopyAll()}
            >
              {copyingAll ? "Copying..." : "Copy all from members"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Landing site embed</CardTitle>
          <CardDescription>
            Add this script to the Next.js landing layout. Use <code>data-lang="en"</code> or{" "}
            <code>data-lang="ar"</code>. Optional: <code>data-site-host</code> if the marketing host
            is not www.rehamdiva.com.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Script tag</Label>
            <div className="flex flex-wrap gap-2">
              <Textarea readOnly value={embedSnippet} rows={2} className="font-mono text-sm" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copyText(embedSnippet, "Script tag")}
              >
                <Copy className="me-2 h-4 w-4" />
                Copy
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Next.js snippet</Label>
            <div className="flex flex-wrap gap-2">
              <Textarea readOnly value={nextSnippet} rows={12} className="font-mono text-sm" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copyText(nextSnippet, "Next.js snippet")}
              >
                <Copy className="me-2 h-4 w-4" />
                Copy
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Welcome & starter buttons</CardTitle>
            <CardDescription>
              Shown to anonymous visitors when a new public chat starts.
            </CardDescription>
          </div>
          <CopyFromMembersButton
            disabled={!membersSettings}
            onClick={() => {
              if (membersSettings) {
                applyMembersGreeting(membersSettings);
              }
            }}
          />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="public-welcome-en">English welcome message</Label>
            <Textarea
              id="public-welcome-en"
              value={welcomeMessageEn}
              onChange={(event) => setWelcomeMessageEn(event.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="public-welcome-ar">Arabic welcome message</Label>
            <Textarea
              id="public-welcome-ar"
              value={welcomeMessageAr}
              onChange={(event) => setWelcomeMessageAr(event.target.value)}
              rows={3}
              dir="rtl"
            />
          </div>
          <div className="space-y-3">
            {suggestionDrafts.map((item, index) => (
              <div key={item.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                <Input
                  value={item.textEn}
                  placeholder={`Starter ${index + 1} English`}
                  onChange={(event) =>
                    setSuggestionDrafts((previous) =>
                      previous.map((suggestion) =>
                        suggestion.id === item.id
                          ? { ...suggestion, textEn: event.target.value }
                          : suggestion,
                      ),
                    )
                  }
                />
                <Input
                  value={item.textAr}
                  placeholder={`Starter ${index + 1} Arabic`}
                  dir="rtl"
                  onChange={(event) =>
                    setSuggestionDrafts((previous) =>
                      previous.map((suggestion) =>
                        suggestion.id === item.id
                          ? { ...suggestion, textAr: event.target.value }
                          : suggestion,
                      ),
                    )
                  }
                />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={suggestionDrafts.length >= MAX_STARTER_SUGGESTIONS}
                onClick={() =>
                  setSuggestionDrafts((previous) => [
                    ...previous,
                    { id: newSuggestionDraftId(), textEn: "", textAr: "" },
                  ])
                }
              >
                Add starter
              </Button>
              {suggestionDrafts.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSuggestionDrafts((previous) => previous.slice(0, -1))}
                >
                  Remove last
                </Button>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            onClick={() => void handleSaveGreeting()}
            disabled={!greetingDirty || isSavingGreeting || greetingOverLimit}
          >
            {isSavingGreeting ? "Saving..." : "Save greeting"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Custom instructions</CardTitle>
            <CardDescription>
              Public-only prompt. Saving here never changes the members assistant.
            </CardDescription>
          </div>
          <CopyFromMembersButton
            disabled={!membersSettings}
            onClick={() => {
              if (membersSettings) {
                setCustomInstructions(membersSettings.customInstructions);
              }
            }}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={customInstructions}
            onChange={(event) => setCustomInstructions(event.target.value)}
            rows={14}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {characterCount.toLocaleString()} / {MAX_CUSTOM_INSTRUCTIONS_LENGTH.toLocaleString()}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || isOverLimit || trimmedLength === 0}
            >
              {isSaving ? "Saving..." : "Save instructions"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCustomInstructions(settings.defaultCustomInstructions)}
            >
              Reset to public default
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Second-pass cleanup</CardTitle>
            <CardDescription>
              Public-only rewrite/CTA cleanup prompts. Defaults match the members assistant until you
              change them.
            </CardDescription>
          </div>
          <CopyFromMembersButton
            disabled={!membersSettings}
            onClick={() => {
              if (!membersSettings) {
                return;
              }
              setCleanupCtaSystem(membersSettings.cleanup.ctaSystemPrompt);
              setCleanupStreamSystem(membersSettings.cleanup.streamSystemPrompt);
              setCleanupCtaUserTemplate(membersSettings.cleanup.ctaUserPromptTemplate);
              setCleanupStreamUserTemplate(membersSettings.cleanup.streamUserPromptTemplate);
              setCleanupModel(membersSettings.cleanup.model);
              setCleanupCtaTemperature(String(membersSettings.cleanup.ctaTemperature));
            }}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={cleanupCtaSystem}
            onChange={(event) => setCleanupCtaSystem(event.target.value)}
            rows={6}
            className="font-mono text-sm"
          />
          <Textarea
            value={cleanupStreamSystem}
            onChange={(event) => setCleanupStreamSystem(event.target.value)}
            rows={6}
            className="font-mono text-sm"
          />
          <Textarea
            value={cleanupCtaUserTemplate}
            onChange={(event) => setCleanupCtaUserTemplate(event.target.value)}
            rows={5}
            className="font-mono text-sm"
          />
          <Textarea
            value={cleanupStreamUserTemplate}
            onChange={(event) => setCleanupStreamUserTemplate(event.target.value)}
            rows={5}
            className="font-mono text-sm"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="public-cleanup-model">Model override</Label>
              <Input
                id="public-cleanup-model"
                value={cleanupModel}
                onChange={(event) => setCleanupModel(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="public-cleanup-temp">CTA temperature</Label>
              <Input
                id="public-cleanup-temp"
                value={cleanupCtaTemperature}
                onChange={(event) => setCleanupCtaTemperature(event.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            onClick={() => void handleSaveCleanup()}
            disabled={!cleanupDirty || isSavingCleanup || cleanupOverLimit || !cleanupTemperatureValid}
          >
            {isSavingCleanup ? "Saving..." : "Save second-pass settings"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Public tools</CardTitle>
          <CardDescription>
            Account, billing, and memory tools are omitted. Catalog and WhatsApp copy are public-only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {settings.tools.map((tool) => {
              const draft = addonDrafts[tool.toolId] ?? tool.descriptionAddon;
              const isDirty = draft !== tool.descriptionAddon;
              const memberTool = membersSettings?.tools.find((item) => item.toolId === tool.toolId);
              return (
                <AccordionItem key={tool.toolId} value={tool.toolId}>
                  <div className="flex items-center gap-3 py-2">
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
                    <Switch
                      checked={tool.enabled}
                      disabled={togglingToolId === tool.toolId}
                      onCheckedChange={(checked) => void handleToggleTool(tool, checked)}
                    />
                  </div>
                  <AccordionContent className="space-y-4 pb-4">
                    <Textarea
                      readOnly
                      value={tool.defaultDescription}
                      rows={4}
                      className="cursor-default bg-muted/40 font-mono text-sm"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label>Additional guidance</Label>
                      <CopyFromMembersButton
                        disabled={!memberTool}
                        onClick={() => {
                          if (memberTool) {
                            setAddonDrafts((previous) => ({
                              ...previous,
                              [tool.toolId]: memberTool.descriptionAddon,
                            }));
                          }
                        }}
                      />
                    </div>
                    <Textarea
                      value={draft}
                      onChange={(event) =>
                        setAddonDrafts((previous) => ({
                          ...previous,
                          [tool.toolId]: event.target.value,
                        }))
                      }
                      rows={4}
                      className="font-mono text-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleSaveAddon(tool)}
                      disabled={!isDirty || savingToolId === tool.toolId}
                    >
                      {savingToolId === tool.toolId ? "Saving..." : "Save guidance"}
                    </Button>
                    {tool.toolId === "showCoursesCatalog" ? (
                      <div className="space-y-3 rounded-lg border p-4">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-medium">Fixed catalog message</h4>
                          <CopyFromMembersButton
                            disabled={!membersSettings}
                            onClick={() => {
                              if (membersSettings) {
                                setCatalogMessageEn(membersSettings.coursesCatalog.messageEn);
                                setCatalogMessageAr(membersSettings.coursesCatalog.messageAr);
                              }
                            }}
                          />
                        </div>
                        <Textarea
                          value={catalogMessageEn}
                          onChange={(event) => setCatalogMessageEn(event.target.value)}
                          rows={3}
                        />
                        <Textarea
                          value={catalogMessageAr}
                          onChange={(event) => setCatalogMessageAr(event.target.value)}
                          rows={3}
                          dir="rtl"
                        />
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
                      </div>
                    ) : null}
                    {tool.toolId === "sendWhatsAppSupport" ? (
                      <div className="space-y-3 rounded-lg border p-4">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-medium">Fixed WhatsApp support message</h4>
                          <CopyFromMembersButton
                            disabled={!membersSettings}
                            onClick={() => {
                              if (membersSettings) {
                                setWhatsAppMessageEn(membersSettings.whatsAppSupport.messageEn);
                                setWhatsAppMessageAr(membersSettings.whatsAppSupport.messageAr);
                              }
                            }}
                          />
                        </div>
                        <Textarea
                          value={whatsAppMessageEn}
                          onChange={(event) => setWhatsAppMessageEn(event.target.value)}
                          rows={3}
                        />
                        <Textarea
                          value={whatsAppMessageAr}
                          onChange={(event) => setWhatsAppMessageAr(event.target.value)}
                          rows={3}
                          dir="rtl"
                        />
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
                      </div>
                    ) : null}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Locked public instructions</CardTitle>
          <CardDescription>
            Public safety rules. The visitor is treated as anonymous; subscription and billing tools
            are never exposed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            readOnly
            value={settings.fixedInstructions}
            rows={16}
            className="min-h-[280px] cursor-default bg-muted/40 font-mono text-sm"
          />
        </CardContent>
      </Card>
    </div>
  );
}
