import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
import { ImageDropzone, type ImageUploadState } from "@/components/ImageDropzone";
import { Textarea } from "@/components/ui/textarea";
import { CourseMultiPicker } from "./CourseMultiPicker";
import { personalTestResultSchema } from "../../../shared/validation/personalTest";
import { isResultColor } from "./resultColor";

export type ResultFormValues = {
  _id?: Id<"personalTestResults">;
  title: string;
  title_ar: string;
  description?: string;
  description_ar?: string;
  cover_image_url?: string;
  color?: string;
  recommendedCourseIds?: Id<"courses">[];
  ctaText?: string;
  ctaText_ar?: string;
  ctaUrl?: string;
};

type ResultFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testId: Id<"personalTests">;
  initial?: ResultFormValues;
  mode: "create" | "edit";
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

function uploadFile(
  uploadUrl: string,
  file: File,
  onProgress: (progress: number) => void,
) {
  return new Promise<{ storageId: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.responseType = "json";
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    onProgress(0);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(1, event.loaded / event.total));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error while uploading the image."));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response =
            xhr.response && typeof xhr.response === "object"
              ? xhr.response
              : JSON.parse(xhr.responseText);
          if (response && typeof response.storageId === "string") {
            onProgress(1);
            resolve({ storageId: response.storageId });
            return;
          }
          reject(new Error("Upload completed but no storage ID was returned."));
        } catch (parseError) {
          reject(
            parseError instanceof Error
              ? parseError
              : new Error("Failed to parse upload response."),
          );
        }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}.`));
      }
    };

    xhr.send(file);
  });
}

export function ResultFormDialog({
  open,
  onOpenChange,
  testId,
  initial,
  mode,
}: ResultFormDialogProps) {
  const saveResult = useMutation(api.personalTest.savePersonalTestResult);
  const generateImageUploadUrl = useMutation(
    api.personalTest.generatePersonalTestImageUploadUrl,
  );

  const [title, setTitle] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [color, setColor] = useState("");
  const [recommendedCourseIds, setRecommendedCourseIds] = useState<
    Id<"courses">[]
  >([]);
  const [ctaEnabled, setCtaEnabled] = useState(false);
  const [ctaText, setCtaText] = useState("");
  const [ctaTextAr, setCtaTextAr] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [clearCover, setClearCover] = useState(false);
  const [coverUploadState, setCoverUploadState] = useState<ImageUploadState>({
    status: "idle",
    progress: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const tempCoverUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle(initial?.title ?? "");
    setTitleAr(initial?.title_ar ?? "");
    setDescription(initial?.description ?? "");
    setDescriptionAr(initial?.description_ar ?? "");
    setColor(isResultColor(initial?.color) ? initial.color : "");
    setRecommendedCourseIds(initial?.recommendedCourseIds ?? []);
    setCtaEnabled(Boolean(initial?.ctaText && initial.ctaText_ar && initial.ctaUrl));
    setCtaText(initial?.ctaText ?? "");
    setCtaTextAr(initial?.ctaText_ar ?? "");
    setCtaUrl(initial?.ctaUrl ?? "");
    setCoverPreviewUrl(initial?.cover_image_url ?? null);
    setCoverFile(null);
    setClearCover(false);
    setCoverUploadState({ status: "idle", progress: 0 });
    setError(null);
  }, [open, initial]);

  useEffect(() => {
    return () => {
      if (tempCoverUrlRef.current) {
        URL.revokeObjectURL(tempCoverUrlRef.current);
      }
    };
  }, []);

  const resetTempCoverPreview = () => {
    if (tempCoverUrlRef.current) {
      URL.revokeObjectURL(tempCoverUrlRef.current);
      tempCoverUrlRef.current = null;
    }
  };

  const handleCoverSelect = (file: File) => {
    resetTempCoverPreview();
    const previewUrl = URL.createObjectURL(file);
    tempCoverUrlRef.current = previewUrl;
    setCoverPreviewUrl(previewUrl);
    setCoverFile(file);
    setClearCover(false);
    setCoverUploadState({ status: "idle", progress: 0 });
  };

  const handleRemoveCover = () => {
    resetTempCoverPreview();
    setCoverPreviewUrl(null);
    setCoverFile(null);
    setClearCover(true);
    setCoverUploadState({ status: "idle", progress: 0 });
  };

  const handleSave = async (event?: FormEvent) => {
    event?.preventDefault();
    const parsed = personalTestResultSchema.safeParse({
      title,
      titleAr,
      description,
      descriptionAr,
      color,
      recommendedCourseIds,
      ctaEnabled,
      ctaText: ctaEnabled ? ctaText : undefined,
      ctaTextAr: ctaEnabled ? ctaTextAr : undefined,
      ctaUrl: ctaEnabled ? ctaUrl : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid result.");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      let coverStorageId: Id<"_storage"> | undefined;
      if (coverFile) {
        setCoverUploadState({ status: "uploading", progress: 0 });
        const uploadUrl = await generateImageUploadUrl();
        const { storageId } = await uploadFile(uploadUrl, coverFile, (progress) => {
          setCoverUploadState({ status: "uploading", progress });
        });
        coverStorageId = storageId as Id<"_storage">;
        setCoverUploadState({ status: "success", progress: 1 });
      }

      await saveResult({
        testId,
        resultId: initial?._id,
        title: parsed.data.title,
        titleAr: parsed.data.titleAr,
        description: parsed.data.description,
        descriptionAr: parsed.data.descriptionAr,
        color: parsed.data.color,
        recommendedCourseIds: parsed.data.recommendedCourseIds as Id<"courses">[],
        ctaEnabled: parsed.data.ctaEnabled,
        ctaText: parsed.data.ctaText,
        ctaTextAr: parsed.data.ctaTextAr,
        ctaUrl: parsed.data.ctaUrl,
        coverStorageId,
        clearCover: coverFile ? false : clearCover,
      });

      toast.success(mode === "edit" ? "Result updated." : "Result added.");
      onOpenChange(false);
    } catch (saveError) {
      const message = getErrorMessage(saveError);
      if (coverFile) {
        setCoverUploadState({
          status: "error",
          progress: 0,
          errorMessage: message,
        });
      }
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{mode === "create" ? "Add result" : "Edit result"}</DialogTitle>
          <DialogDescription>
            This is the page a test taker can see based on their answers.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="result-title">Title</Label>
                <Input
                  id="result-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="result-title-ar">Title (Arabic)</Label>
                <Input
                  id="result-title-ar"
                  value={titleAr}
                  dir="rtl"
                  onChange={(event) => setTitleAr(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="result-description">Description (optional)</Label>
                <Textarea
                  id="result-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="result-description-ar">
                  Description (Arabic, optional)
                </Label>
                <Textarea
                  id="result-description-ar"
                  value={descriptionAr}
                  dir="rtl"
                  onChange={(event) => setDescriptionAr(event.target.value)}
                  rows={4}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Accent color (optional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={color || "#E91E8C"}
                  onChange={(event) => setColor(event.target.value)}
                  className="h-10 w-12 cursor-pointer p-1"
                  aria-label="Result color"
                />
                <Input
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  placeholder="#E91E8C"
                  className="font-mono"
                />
                {color && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setColor("")}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Used on correlation lines and on the result title and button.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Recommended courses (optional)</Label>
              <CourseMultiPicker
                selectedCourseIds={recommendedCourseIds}
                onChange={setRecommendedCourseIds}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <ImageDropzone
                id="result-cover"
                label="Cover photo (optional)"
                helperText="Landscape image recommended (16:9)."
                aspectRatioClass="aspect-video"
                value={coverPreviewUrl}
                onSelectFile={handleCoverSelect}
                uploadState={coverUploadState}
                disabled={isSaving}
              />
              {coverPreviewUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveCover}
                  disabled={isSaving}
                >
                  Remove cover
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label htmlFor="result-cta">Call to action button</Label>
                <p className="text-sm text-muted-foreground">
                  Optional button with bilingual text and a link.
                </p>
              </div>
              <Switch
                id="result-cta"
                checked={ctaEnabled}
                onCheckedChange={setCtaEnabled}
              />
            </div>

            {ctaEnabled && (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="result-cta-text">Button text</Label>
                    <Input
                      id="result-cta-text"
                      value={ctaText}
                      onChange={(event) => setCtaText(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="result-cta-text-ar">Button text (Arabic)</Label>
                    <Input
                      id="result-cta-text-ar"
                      value={ctaTextAr}
                      dir="rtl"
                      onChange={(event) => setCtaTextAr(event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="result-cta-url">Button link</Label>
                  <Input
                    id="result-cta-url"
                    type="url"
                    placeholder="https://"
                    value={ctaUrl}
                    onChange={(event) => setCtaUrl(event.target.value)}
                  />
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="cta" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save result"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
