import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const AssistantSettings = () => {
  const settings = useQuery(api.assistant.settings.getAssistantSettings);
  const updateSettings = useMutation(api.assistant.settings.updateAssistantSettings);
  const [customInstructions, setCustomInstructions] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings?.customInstructions !== undefined) {
      setCustomInstructions(settings.customInstructions);
    }
  }, [settings?.customInstructions]);

  if (settings === undefined) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading assistant settings...</p>
      </div>
    );
  }

  const handleSave = async () => {
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Assistant settings</h1>
          <p className="text-muted-foreground">
            Customize the editable part of the assistant prompt. Tool, schema, and safety rules stay
            locked.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/assistant-test">Open assistant</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Editable prompt</CardTitle>
          <CardDescription>
            Brand voice, tone, and high-level behavior. User context and private memory are injected
            automatically at runtime.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="assistant-custom-prompt">Custom instructions</Label>
            <Textarea
              id="assistant-custom-prompt"
              value={customInstructions}
              onChange={(event) => setCustomInstructions(event.target.value)}
              rows={16}
              className="min-h-[320px] font-mono text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
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
