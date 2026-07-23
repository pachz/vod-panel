import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type NamedInstruction = FunctionReturnType<
  typeof api.assistant.namedInstructions.listNamedInstructions
>[number];

const MAX_NAME_LENGTH = 80;
const MAX_TITLE_LENGTH = 120;
const MAX_WHEN_TO_USE_LENGTH = 500;
const MAX_BODY_LENGTH = 20_000;

type FormState = {
  name: string;
  title: string;
  whenToUse: string;
  body: string;
  enabled: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  title: "",
  whenToUse: "",
  body: "",
  enabled: true,
};

function formFromInstruction(instruction: NamedInstruction): FormState {
  return {
    name: instruction.name,
    title: instruction.title,
    whenToUse: instruction.whenToUse,
    body: instruction.body,
    enabled: instruction.enabled,
  };
}

export function NamedInstructionsSection() {
  const instructions = useQuery(api.assistant.namedInstructions.listNamedInstructions);
  const createInstruction = useMutation(api.assistant.namedInstructions.createNamedInstruction);
  const updateInstruction = useMutation(api.assistant.namedInstructions.updateNamedInstruction);
  const deleteInstruction = useMutation(api.assistant.namedInstructions.deleteNamedInstruction);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"assistantNamedInstructions"> | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NamedInstruction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<Id<"assistantNamedInstructions"> | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  };

  const openEdit = (instruction: NamedInstruction) => {
    setEditingId(instruction._id);
    setForm(formFromInstruction(instruction));
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.title.trim() || !form.whenToUse.trim() || !form.body.trim()) {
      toast.error("Name, title, when to use, and instructions are required.");
      return;
    }
    if (form.body.length > MAX_BODY_LENGTH) {
      toast.error(`Instructions are too long (max ${MAX_BODY_LENGTH.toLocaleString()} characters).`);
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        await updateInstruction({
          id: editingId,
          name: form.name,
          title: form.title,
          whenToUse: form.whenToUse,
          body: form.body,
          enabled: form.enabled,
        });
        toast.success("Instruction pack updated");
      } else {
        await createInstruction({
          name: form.name,
          title: form.title,
          whenToUse: form.whenToUse,
          body: form.body,
          enabled: form.enabled,
        });
        toast.success("Instruction pack created");
      }
      setEditorOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save instruction");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (instruction: NamedInstruction, enabled: boolean) => {
    setTogglingId(instruction._id);
    try {
      await updateInstruction({ id: instruction._id, enabled });
      toast.success(enabled ? `"${instruction.name}" enabled` : `"${instruction.name}" disabled`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update instruction");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteInstruction({ id: deleteTarget._id });
      toast.success(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete instruction");
    } finally {
      setIsDeleting(false);
    }
  };

  if (instructions === undefined) {
    return <p className="text-sm text-muted-foreground">Loading instruction packs…</p>;
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Instruction packs</h4>
          <p className="text-xs text-muted-foreground">
            Named bodies the model can load on demand via this tool. Set{" "}
            <span className="font-medium">when to use</span> so the assistant knows when to fetch
            each pack.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="me-1.5 h-4 w-4" />
          Add pack
        </Button>
      </div>

      {instructions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No packs yet. Add one so the assistant can call getNamedInstructions.
        </p>
      ) : (
        <ul className="space-y-2">
          {instructions.map((instruction) => {
            const isToggling = togglingId === instruction._id;
            return (
              <li
                key={instruction._id}
                className={cn(
                  "flex flex-wrap items-start gap-3 rounded-md border bg-background p-3",
                  !instruction.enabled && "opacity-70",
                )}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                      {instruction.name}
                    </code>
                    <span className="text-sm font-medium">{instruction.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{instruction.whenToUse}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <div className="me-1 flex items-center gap-2">
                    <Label
                      htmlFor={`named-enabled-${instruction._id}`}
                      className="text-xs text-muted-foreground"
                    >
                      {instruction.enabled ? "On" : "Off"}
                    </Label>
                    <Switch
                      id={`named-enabled-${instruction._id}`}
                      checked={instruction.enabled}
                      disabled={isToggling}
                      onCheckedChange={(checked) => void handleToggle(instruction, checked)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${instruction.name}`}
                    onClick={() => openEdit(instruction)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${instruction.name}`}
                    onClick={() => setDeleteTarget(instruction)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit instruction pack" : "New instruction pack"}</DialogTitle>
            <DialogDescription>
              The model fetches packs by <span className="font-medium">name</span> when the
              conversation matches <span className="font-medium">when to use</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="named-instruction-name">Name (tool key)</Label>
              <Input
                id="named-instruction-name"
                value={form.name}
                maxLength={MAX_NAME_LENGTH}
                placeholder="e.g. refund-escalation"
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, hyphens. This is what the model passes to the tool.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="named-instruction-title">Title</Label>
              <Input
                id="named-instruction-title"
                value={form.title}
                maxLength={MAX_TITLE_LENGTH}
                placeholder="Human-readable label"
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <Label htmlFor="named-instruction-when">When to use</Label>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {form.whenToUse.length.toLocaleString()} / {MAX_WHEN_TO_USE_LENGTH.toLocaleString()}
                </p>
              </div>
              <Textarea
                id="named-instruction-when"
                value={form.whenToUse}
                maxLength={MAX_WHEN_TO_USE_LENGTH}
                rows={3}
                placeholder="e.g. When the user asks about refunds, chargebacks, or billing disputes…"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, whenToUse: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <Label htmlFor="named-instruction-body">Instructions</Label>
                <p
                  className={cn(
                    "text-xs tabular-nums",
                    form.body.length > MAX_BODY_LENGTH
                      ? "font-medium text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {form.body.length.toLocaleString()} / {MAX_BODY_LENGTH.toLocaleString()}
                </p>
              </div>
              <Textarea
                id="named-instruction-body"
                value={form.body}
                rows={10}
                className="font-mono text-sm"
                placeholder="Detailed guidance the model should follow after loading this pack…"
                onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="named-instruction-enabled"
                checked={form.enabled}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
              />
              <Label htmlFor="named-instruction-enabled">Enabled for the assistant</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? "Saving…" : editingId ? "Save changes" : "Create pack"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete instruction pack?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes{" "}
              <span className="font-medium">{deleteTarget?.name}</span> permanently. The assistant
              will no longer be able to load it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
