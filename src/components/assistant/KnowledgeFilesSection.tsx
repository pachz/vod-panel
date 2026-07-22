import { useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { FileSpreadsheet, Loader2, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type KnowledgeFile = FunctionReturnType<typeof api.assistant.knowledgeFiles.listKnowledgeFiles>[number];

const ACCEPT =
  ".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const ALLOWED_EXTENSIONS = [".csv", ".xls", ".xlsx"];

type LocalUploadState = {
  fileName: string;
  progress: number;
  status: "uploading" | "registering";
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasAllowedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function uploadFileWithProgress(
  uploadUrl: string,
  file: File,
  onProgress: (progress: number) => void,
): Promise<{ storageId: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(1, event.loaded / event.total));
      }
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Upload failed (${xhr.status})`));
        return;
      }
      try {
        const response = JSON.parse(xhr.responseText) as { storageId?: string };
        if (!response.storageId) {
          reject(new Error("Upload response missing storageId"));
          return;
        }
        resolve({ storageId: response.storageId });
      } catch {
        reject(new Error("Invalid upload response"));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    xhr.send(file);
  });
}

function stageLabel(file: KnowledgeFile): string {
  if (file.status === "pending") return "Queued…";
  if (file.status === "deleting") return "Deleting…";
  if (file.status === "failed") return file.errorMessage || "Processing failed";
  if (file.status === "ready") {
    const sheets = file.sheetCount ?? 0;
    const rows = file.rowCount ?? 0;
    return `${sheets} sheet${sheets === 1 ? "" : "s"} · ${rows.toLocaleString()} rows`;
  }

  switch (file.processingStage) {
    case "queued":
      return "Queued…";
    case "parsing":
      return "Parsing sheets…";
    case "describing":
      return "Generating descriptions…";
    case "indexing":
      return "Building bilingual text & embeddings…";
    case "saving":
      return "Saving rows…";
    default:
      return "Processing…";
  }
}

function statusBadge(file: KnowledgeFile) {
  if (file.isActive && file.status === "ready") {
    return <Badge>Active</Badge>;
  }
  switch (file.status) {
    case "ready":
      return <Badge variant="secondary">Ready</Badge>;
    case "pending":
    case "processing":
      return <Badge variant="outline">Processing</Badge>;
    case "deleting":
      return <Badge variant="outline">Deleting</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return null;
  }
}

function FileProgressBar({ file }: { file: KnowledgeFile }) {
  const isBusy =
    file.status === "pending" || file.status === "processing" || file.status === "deleting";
  if (!isBusy && file.status !== "failed") {
    return null;
  }

  const value =
    file.status === "deleting"
      ? undefined
      : Math.max(0, Math.min(100, file.processingProgress ?? (file.status === "pending" ? 2 : 0)));

  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {(file.status === "pending" ||
            file.status === "processing" ||
            file.status === "deleting") && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          )}
          {stageLabel(file)}
        </span>
        {typeof value === "number" && file.status !== "failed" && (
          <span className="tabular-nums">{Math.round(value)}%</span>
        )}
      </div>
      {file.status !== "failed" && (
        <Progress value={value ?? 15} className={cn(file.status === "deleting" && "animate-pulse")} />
      )}
    </div>
  );
}

function KnowledgeFileSheets({ fileId }: { fileId: Id<"assistantKnowledgeFiles"> }) {
  const sheets = useQuery(api.assistant.knowledgeFiles.getKnowledgeFileSheets, { fileId });

  if (sheets === undefined) {
    return <p className="text-xs text-muted-foreground">Loading sheets…</p>;
  }
  if (sheets.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 space-y-2 border-t pt-3">
      {sheets.map((sheet) => (
        <li key={sheet._id} className="rounded-md bg-muted/40 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{sheet.name}</span>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="font-normal capitalize">
                {sheet.searchMode}
              </Badge>
              {(sheet.languages ?? []).map((lang) => (
                <Badge key={lang} variant="secondary" className="font-normal uppercase">
                  {lang}
                </Badge>
              ))}
            </div>
          </div>
          {sheet.purpose && (
            <p className="mt-1 text-xs text-muted-foreground">{sheet.purpose}</p>
          )}
          {sheet.searchHints && (
            <p className="mt-1 text-xs text-muted-foreground">Search: {sheet.searchHints}</p>
          )}
          {(sheet.keywords?.length ?? 0) > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Keywords: {sheet.keywords!.join(", ")}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {sheet.rowCount.toLocaleString()} rows · {sheet.headers.join(", ")}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function KnowledgeFilesSection() {
  const files = useQuery(api.assistant.knowledgeFiles.listKnowledgeFiles);
  const generateUploadUrl = useMutation(api.assistant.knowledgeFiles.generateKnowledgeFileUploadUrl);
  const createFile = useMutation(api.assistant.knowledgeFiles.createKnowledgeFile);
  const setActive = useMutation(api.assistant.knowledgeFiles.setKnowledgeFileActive);
  const deleteFile = useMutation(api.assistant.knowledgeFiles.deleteKnowledgeFile);
  const retryFile = useMutation(api.assistant.knowledgeFiles.retryKnowledgeFileProcessing);

  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [localUpload, setLocalUpload] = useState<LocalUploadState | null>(null);
  const [togglingId, setTogglingId] = useState<Id<"assistantKnowledgeFiles"> | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"assistantKnowledgeFiles"> | null>(null);
  const [retryingId, setRetryingId] = useState<Id<"assistantKnowledgeFiles"> | null>(null);
  const [expandedId, setExpandedId] = useState<Id<"assistantKnowledgeFiles"> | null>(null);

  const isUploading = localUpload !== null;

  const handleSelectFile = async (file: File) => {
    if (isUploading) return;

    if (!hasAllowedExtension(file.name)) {
      toast.error("Only Excel (.xls, .xlsx) or CSV files are allowed.");
      return;
    }
    if (file.size <= 0) {
      toast.error("File is empty.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 15 MB.");
      return;
    }

    setLocalUpload({ fileName: file.name, progress: 0, status: "uploading" });

    try {
      const uploadUrl = await generateUploadUrl();
      const { storageId } = await uploadFileWithProgress(uploadUrl, file, (progress) => {
        setLocalUpload({
          fileName: file.name,
          progress: progress * 0.85,
          status: "uploading",
        });
      });

      setLocalUpload({ fileName: file.name, progress: 0.9, status: "registering" });

      await createFile({
        storageId: storageId as Id<"_storage">,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });

      setLocalUpload({ fileName: file.name, progress: 1, status: "registering" });
      toast.success("File uploaded — processing started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setLocalUpload(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const handleFiles = (list: FileList | null) => {
    if (!list?.length || isUploading) return;
    const file = list[0];
    if (file) {
      void handleSelectFile(file);
    }
  };

  const handleToggleActive = async (file: KnowledgeFile, isActive: boolean) => {
    setTogglingId(file._id);
    try {
      await setActive({ fileId: file._id, isActive });
      toast.success(isActive ? "File set as active knowledge base" : "File deactivated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update active file");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (file: KnowledgeFile) => {
    if (
      !window.confirm(
        `Delete “${file.fileName}”? This removes all sheets and rows and cannot be undone.`,
      )
    ) {
      return;
    }

    setDeletingId(file._id);
    try {
      await deleteFile({ fileId: file._id });
      toast.success("Deleting file…");
      if (expandedId === file._id) {
        setExpandedId(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete file");
    } finally {
      setDeletingId(null);
    }
  };

  const handleRetry = async (file: KnowledgeFile) => {
    setRetryingId(file._id);
    try {
      await retryFile({ fileId: file._id });
      toast.success("Processing restarted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to retry processing");
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-medium">Files</h3>
        <p className="text-sm text-muted-foreground">
          Upload Excel or CSV workbooks. We parse each sheet, extract rows into a searchable index,
          and use AI to label sheet purpose and search mode. Only one file can be active.
        </p>
      </div>

      <div
        role="button"
        tabIndex={isUploading ? -1 : 0}
        aria-disabled={isUploading}
        onClick={() => {
          if (!isUploading) inputRef.current?.click();
        }}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (isUploading) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event: DragEvent<HTMLDivElement>) => {
          if (isUploading) return;
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setIsDragOver(false);
        }}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          if (isUploading) return;
          event.preventDefault();
          setIsDragOver(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
          isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 bg-muted/20",
          isUploading && "pointer-events-none opacity-70",
        )}
      >
        <Upload className="h-8 w-8 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-medium">Drop a spreadsheet here, or click to browse</p>
          <p className="text-xs text-muted-foreground">CSV, XLS, or XLSX · max 15 MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={isUploading}
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>

      {localUpload && (
        <div className="space-y-2 rounded-lg border px-4 py-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2 truncate font-medium">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              <span className="truncate">{localUpload.fileName}</span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {Math.round(localUpload.progress * 100)}%
            </span>
          </div>
          <Progress value={Math.round(localUpload.progress * 100)} />
          <p className="text-xs text-muted-foreground">
            {localUpload.status === "uploading" ? "Uploading file…" : "Starting processing…"}
          </p>
        </div>
      )}

      {files === undefined ? (
        <p className="text-sm text-muted-foreground">Loading files…</p>
      ) : files.length === 0 && !localUpload ? (
        <p className="text-sm text-muted-foreground">No knowledge files yet.</p>
      ) : (
        <ul className="space-y-3">
          {files.map((file) => {
            const busy =
              file.status === "pending" ||
              file.status === "processing" ||
              file.status === "deleting";
            const canActivate = file.status === "ready";
            const isExpanded = expandedId === file._id;

            return (
              <li key={file._id} className="rounded-lg border px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{file.fileName}</span>
                      {statusBadge(file)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.sizeBytes)} ·{" "}
                      {new Date(file.createdAt).toLocaleString()}
                    </p>
                    {file.description && file.status === "ready" && (
                      <p className="text-sm text-muted-foreground">{file.description}</p>
                    )}
                    {file.status === "ready" && (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {(file.languages?.length ?? 0) > 0 && (
                          <p>
                            Languages:{" "}
                            <span className="uppercase">{file.languages!.join(", ")}</span>
                          </p>
                        )}
                        {file.whenToUse && <p>When to use: {file.whenToUse}</p>}
                        {file.howToSearch && <p>How to search: {file.howToSearch}</p>}
                        {(file.exampleQueries?.length ?? 0) > 0 && (
                          <p>Examples: {file.exampleQueries!.join(" · ")}</p>
                        )}
                      </div>
                    )}
                    <FileProgressBar file={file} />
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`knowledge-active-${file._id}`}
                        className="text-xs text-muted-foreground"
                      >
                        Active
                      </Label>
                      <Switch
                        id={`knowledge-active-${file._id}`}
                        checked={file.isActive}
                        disabled={!canActivate || togglingId === file._id || busy}
                        onCheckedChange={(checked) => void handleToggleActive(file, checked)}
                      />
                    </div>
                    {file.status === "ready" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setExpandedId((current) => (current === file._id ? null : file._id))
                        }
                      >
                        {isExpanded ? "Hide sheets" : "Sheets"}
                      </Button>
                    )}
                    {file.status === "failed" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={retryingId === file._id}
                        onClick={() => void handleRetry(file)}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        {retryingId === file._id ? "Retrying…" : "Retry"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={busy || deletingId === file._id}
                      onClick={() => void handleDelete(file)}
                      aria-label={`Delete ${file.fileName}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {isExpanded && file.status === "ready" && (
                  <div className="space-y-3">
                    {file.toolDescription && (
                      <div className="mt-3 space-y-1 border-t pt-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          Tool description (used at runtime when this file is active)
                        </p>
                        <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                          {file.toolDescription}
                        </p>
                      </div>
                    )}
                    <KnowledgeFileSheets fileId={file._id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
