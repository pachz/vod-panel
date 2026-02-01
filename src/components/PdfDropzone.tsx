import { useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import { FileText, Download, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const PDF_MIME = "application/pdf";

/** Format bytes to human-readable size (e.g. 1.2 MB). */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type PdfUploadState = {
  status: "idle" | "uploading" | "success" | "error";
  progress: number;
  errorMessage?: string;
};

type PdfDropzoneProps = {
  id: string;
  label: string;
  helperText?: string;
  fileName: string | null;
  fileUrl: string | null;
  fileSizeBytes?: number | null;
  /** When set, show file card with this name after successful upload until server data arrives. */
  pendingFileName?: string | null;
  onSelectFile: (file: File) => void;
  onRemove: () => void;
  uploadState?: PdfUploadState;
  onRetry?: () => void;
  disabled?: boolean;
  /** When true, show a note that uploading will replace the existing file. */
  hasExistingFile?: boolean;
};

export const PdfDropzone = ({
  id,
  label,
  helperText,
  fileName,
  fileUrl,
  fileSizeBytes,
  pendingFileName,
  onSelectFile,
  onRemove,
  uploadState,
  onRetry,
  disabled = false,
  hasExistingFile = false,
}: PdfDropzoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const isUploading = uploadState?.status === "uploading";
  const isDisabled = disabled || isUploading;

  const handleFiles = (files: FileList | null) => {
    if (isDisabled) return;
    if (!files?.length) return;

    const pdfFile = Array.from(files).find((file) => file.type === PDF_MIME);
    if (!pdfFile) {
      toast.warning("Please choose a PDF file.");
      return;
    }
    onSelectFile(pdfFile);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClick = () => {
    if (isDisabled) return;
    inputRef.current?.click();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    event.preventDefault();
    setIsDragOver(false);
    handleFiles(event.dataTransfer.files);
  };

  const hasFile = !!fileName && !!fileUrl;
  const showSuccessPending = uploadState?.status === "success" && !!pendingFileName;
  const showFileCard =
    (hasFile && uploadState?.status !== "uploading" && uploadState?.status !== "error") ||
    showSuccessPending;
  const displayFileName = showSuccessPending ? pendingFileName : fileName;
  const displayFileUrl = hasFile ? fileUrl : null;

  return (
    <div className="space-y-2">
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
      {helperText ? (
        <p id={`${id}-helper-text`} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      ) : null}
      {hasExistingFile ? (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Uploading a new file will replace the existing PDF.
        </p>
      ) : null}

      {showFileCard ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="truncate" title={displayFileName ?? undefined}>
                  {displayFileName}
                </span>
                <span className="shrink-0 rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-700 dark:text-green-400">
                  {showSuccessPending ? "Uploaded" : "File uploaded"}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {showSuccessPending
                  ? "Saving…"
                  : fileSizeBytes != null && fileSizeBytes > 0
                    ? formatFileSize(fileSizeBytes)
                    : "PDF material"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {displayFileUrl ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    asChild
                  >
                    <a href={displayFileUrl} target="_blank" rel="noopener noreferrer" title="Preview in new tab">
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Preview</span>
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    asChild
                  >
                    <a href={displayFileUrl} download={displayFileName ?? undefined} target="_blank" rel="noopener noreferrer" title="Download">
                      <Download className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Download</span>
                    </a>
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 text-destructive hover:text-destructive"
                onClick={onRemove}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                <span className="sr-only">Remove PDF</span>
              </Button>
            </div>
          </div>
          {uploadState?.status === "uploading" && !showSuccessPending ? (
            <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-3">
              <div className="flex justify-between text-xs font-medium text-muted-foreground">
                <span>Uploading…</span>
                <span>{Math.round((uploadState?.progress ?? 0) * 100)}%</span>
              </div>
              <Progress
                value={Math.min(100, Math.round((uploadState?.progress ?? 0) * 100))}
                className="h-1.5"
              />
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              aria-label="Replace PDF"
              onClick={handleClick}
              onKeyDown={handleKeyDown}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "rounded-md border border-dashed border-border/60 py-3 text-center text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted/30",
                isDragOver && "border-primary/50 bg-primary/5 text-primary",
                isDisabled && "pointer-events-none opacity-60",
              )}
            >
              Drop a new PDF here or click to replace
            </div>
          )}
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={PDF_MIME}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-labelledby={`${id}-label`}
          aria-describedby={helperText ? `${id}-helper-text` : undefined}
          aria-busy={isUploading}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/20 px-6 py-8 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            isDragOver && "border-primary bg-primary/5",
            isDisabled && "cursor-not-allowed opacity-80",
          )}
        >
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={PDF_MIME}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FileText className="h-6 w-6" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              Drop PDF here or click to upload
            </p>
            <p className="text-xs text-muted-foreground">
              Optional course material (PDF only)
            </p>
          </div>
          {uploadState && uploadState.status !== "idle" ? (
            <div className="mt-2 w-full max-w-xs space-y-1.5">
              {uploadState.status === "uploading" ? (
                <>
                  <div className="flex justify-between text-xs font-medium text-muted-foreground">
                    <span>Uploading</span>
                    <span>{Math.round(uploadState.progress * 100)}%</span>
                  </div>
                  <Progress
                    value={Math.min(100, Math.round(uploadState.progress * 100))}
                    className="h-1.5"
                  />
                </>
              ) : null}
              {uploadState.status === "success" ? (
                <p className="text-xs font-medium text-green-600 dark:text-green-500">
                  PDF uploaded
                </p>
              ) : null}
              {uploadState.status === "error" ? (
                <div className="space-y-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs">
                  <p className="font-medium text-destructive">Upload failed</p>
                  {uploadState.errorMessage ? (
                    <p className="text-muted-foreground">{uploadState.errorMessage}</p>
                  ) : null}
                  {onRetry ? (
                    <Button type="button" variant="outline" size="sm" className="h-7" onClick={onRetry}>
                      Try again
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
