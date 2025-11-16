import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoUrlInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}

interface VideoPreview {
  html: string;
  title: string;
  thumbnailUrl: string;
  width: number;
  height: number;
}

const DEBOUNCE_DELAY_MS = 2000; // 2 seconds

export function VideoUrlInput({
  id = "videoUrl",
  value,
  onChange,
  placeholder = "https://vimeo.com/...",
  maxLength = 2048,
  className,
}: VideoUrlInputProps) {
  const validateVideoUrl = useAction(api.image.validateVideoUrl);
  const [preview, setPreview] = useState<VideoPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastValidatedUrlRef = useRef<string>("");
  const lastValidatedPreviewRef = useRef<VideoPreview | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Debounced validation
  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // If input is empty, don't validate
    if (!value || value.trim() === "") {
      setPreview(null);
      setError(null);
      setIsValidating(false);
      lastValidatedUrlRef.current = "";
      lastValidatedPreviewRef.current = null;
      return;
    }

    // If this URL was already validated, restore the preview immediately
    if (value === lastValidatedUrlRef.current && lastValidatedPreviewRef.current) {
      setPreview(lastValidatedPreviewRef.current);
      setError(null);
      setIsValidating(false);
      return;
    }

    // Reset preview and error when input changes (but not if it's the same validated URL)
    setPreview(null);
    setError(null);
    setIsValidating(false);

    // Set up debounce timer
    setIsValidating(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const result = await validateVideoUrl({ videoUrl: value });
        
        if (result.success) {
          const previewData = {
            html: result.html,
            title: result.title,
            thumbnailUrl: result.thumbnailUrl,
            width: result.width,
            height: result.height,
          };
          setPreview(previewData);
          setError(null);
          lastValidatedUrlRef.current = value;
          lastValidatedPreviewRef.current = previewData;
        } else {
          setError("Failed to validate video URL.");
          setPreview(null);
          lastValidatedUrlRef.current = "";
          lastValidatedPreviewRef.current = null;
        }
      } catch (err: unknown) {
        // Extract error message
        let errorMessage = "Failed to validate video URL.";
        if (err && typeof err === "object" && "data" in err) {
          const data = (err as { data?: { message?: string } }).data;
          if (data?.message) {
            errorMessage = data.message;
          }
        } else if (err instanceof Error && err.message) {
          errorMessage = err.message;
        }
        
        setError(errorMessage);
        setPreview(null);
        lastValidatedUrlRef.current = "";
        lastValidatedPreviewRef.current = null;
      } finally {
        setIsValidating(false);
      }
    }, DEBOUNCE_DELAY_MS);

    // Cleanup function
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [value, validateVideoUrl]);

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>Video URL</Label>
      <div className="space-y-2">
        <div className="relative">
          <Input
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            type="url"
            maxLength={maxLength}
            className={cn(
              error && "border-destructive focus-visible:ring-destructive",
              isValidating && "pr-10"
            )}
          />
          {isValidating && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {preview && !error && (
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
            {preview.title && (
              <div className="text-sm font-medium text-foreground">{preview.title}</div>
            )}
            <div className="relative w-full overflow-hidden rounded border border-border bg-background" style={{ maxWidth: "640px" }}>
              <div
                className="relative w-full"
                style={{
                  paddingBottom: `${(preview.height / preview.width) * 100}%`,
                }}
              >
                <div
                  className="absolute inset-0 h-full w-full [&>iframe]:h-full [&>iframe]:w-full"
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

