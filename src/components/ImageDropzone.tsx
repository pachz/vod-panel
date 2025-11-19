import { useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import { Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type ImageUploadState = {
  status: "idle" | "uploading" | "success" | "error";
  progress: number;
  errorMessage?: string;
};

type ImageDropzoneProps = {
  id: string;
  label: string;
  helperText?: string;
  aspectRatioClass: string;
  value: string | null;
  onSelectFile: (file: File) => void;
  uploadState?: ImageUploadState;
  onRetry?: () => void;
  disabled?: boolean;
};

export const ImageDropzone = ({
  id,
  label,
  helperText,
  aspectRatioClass,
  value,
  onSelectFile,
  uploadState,
  onRetry,
  disabled = false,
}: ImageDropzoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const isUploading = uploadState?.status === "uploading";
  const isDisabled = disabled || isUploading;

  const handleFiles = (files: FileList | null) => {
    if (isDisabled) {
      return;
    }

    if (!files || files.length === 0) {
      return;
    }

    const imageFile = Array.from(files).find((file) => file.type.startsWith("image/"));

    if (!imageFile) {
      toast.warning("Please choose an image file.");
      return;
    }

    onSelectFile(imageFile);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleClick = () => {
    if (isDisabled) {
      return;
    }

    inputRef.current?.click();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled) {
      return;
    }

    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled) {
      return;
    }

    event.preventDefault();
    setIsDragOver(false);
    handleFiles(event.dataTransfer.files);
  };

  return (
    <div className="space-y-2">
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
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
          "group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/30 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          aspectRatioClass,
          isDragOver && "border-primary bg-primary/10",
          isDisabled && "cursor-not-allowed opacity-80",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />
        {value ? (
          <>
            <img src={value} alt="" className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end bg-gradient-to-t from-black/50 via-black/0 to-transparent p-4 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              <span>Click or drag to replace</span>
            </div>
          </>
        ) : (
          <div className="pointer-events-none flex flex-col items-center justify-center gap-2 px-6 py-8 text-muted-foreground">
            <ImageIcon className="h-12 w-12" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Click to browse</p>
              <p className="text-xs">or drag and drop an image</p>
            </div>
          </div>
        )}
        {uploadState && uploadState.status !== "idle" ? (
          <div
            className={cn(
              "absolute inset-0 flex flex-col justify-end gap-2 bg-black/60 p-4 text-white transition-opacity",
              uploadState.status === "error" ? "pointer-events-auto" : "pointer-events-none",
            )}
          >
            {uploadState.status === "uploading" ? (
              <>
                <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-white/80">
                  <span>Uploading</span>
                  <span>{Math.round(uploadState.progress * 100)}%</span>
                </div>
                <Progress
                  value={Math.min(100, Math.round(uploadState.progress * 100))}
                  className="h-1 w-full bg-white/30"
                />
              </>
            ) : null}
            {uploadState.status === "success" ? (
              <div className="flex h-8 items-center justify-center rounded-full bg-white/20 text-xs font-medium text-white/90">
                Image updated
              </div>
            ) : null}
            {uploadState.status === "error" ? (
              <div className="flex flex-col gap-2 rounded-lg border border-destructive/50 bg-destructive/60 p-3 text-xs">
                <span className="font-semibold uppercase tracking-wide">
                  Upload failed
                </span>
                {uploadState.errorMessage ? (
                  <span className="text-[11px]/5 text-destructive-foreground/80">
                    {uploadState.errorMessage}
                  </span>
                ) : null}
                {onRetry ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="pointer-events-auto h-7 border-white/30 bg-white/20 text-xs font-semibold text-white shadow-none hover:bg-white/30"
                    onClick={onRetry}
                  >
                    Try again
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {helperText ? (
        <p id={`${id}-helper-text`} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      ) : null}
    </div>
  );
};


