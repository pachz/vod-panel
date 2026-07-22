import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { FileSpreadsheet, Loader2, Search } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type KnowledgeFile = FunctionReturnType<typeof api.assistant.knowledgeFiles.listKnowledgeFiles>[number];
type KnowledgeSheet = FunctionReturnType<
  typeof api.assistant.knowledgeFiles.getKnowledgeFileSheets
>[number];
type KnowledgeRow = FunctionReturnType<
  typeof api.assistant.knowledgeFiles.listKnowledgeSheetRows
>["page"][number];

const PREVIEW_COLUMNS = 4;
const ROWS_PAGE_SIZE = 25;

function truncate(value: string, max = 80): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function cellValue(row: KnowledgeRow, header: string): string {
  const match = row.data.find((cell) => cell.header === header);
  return match?.value?.trim() ?? "";
}

function MetaBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  if (!children) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground/90">{children}</div>
    </div>
  );
}

function ChipList({ items, uppercase }: { items: string[]; uppercase?: boolean }) {
  if (items.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item} variant="secondary" className={cn("font-normal", uppercase && "uppercase")}>
          {item}
        </Badge>
      ))}
    </div>
  );
}

function RowDetailPanel({
  sheetName,
  row,
  onClose,
}: {
  sheetName: string;
  row: KnowledgeRow;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-6">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight">
            Row {row.rowIndex + 1}
            <span className="ms-2 text-base font-normal text-muted-foreground">· {sheetName}</span>
          </h3>
          <p className="text-sm text-muted-foreground">
            Stored cell values and the searchable text used by the assistant.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Back to rows
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">#{row.rowIndex + 1}</Badge>
            <Badge variant={row.hasEmbedding ? "secondary" : "outline"}>
              {row.hasEmbedding ? "Embedding indexed" : "No embedding"}
            </Badge>
            <Badge variant="outline">{row.data.length} fields</Badge>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <dl className="divide-y">
              {row.data.map((cell) => (
                <div
                  key={`${row._id}-${cell.header}`}
                  className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(8rem,12rem)_1fr] sm:gap-4"
                >
                  <dt className="text-sm font-medium text-muted-foreground">{cell.header || "—"}</dt>
                  <dd className="whitespace-pre-wrap break-words text-sm">
                    {cell.value.trim() ? (
                      cell.value
                    ) : (
                      <span className="text-muted-foreground">Empty</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <MetaBlock label="Searchable text">
            <p className="whitespace-pre-wrap rounded-lg bg-muted/50 px-3 py-2 text-sm leading-relaxed">
              {row.searchableText.trim() || "—"}
            </p>
          </MetaBlock>
        </div>
      </ScrollArea>
    </div>
  );
}

function SheetRowsPanel({
  sheet,
  onSelectRow,
}: {
  sheet: KnowledgeSheet;
  onSelectRow: (row: KnowledgeRow) => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.assistant.knowledgeFiles.listKnowledgeSheetRows,
    { sheetId: sheet._id },
    { initialNumItems: ROWS_PAGE_SIZE },
  );

  const previewHeaders = useMemo(
    () => sheet.headers.slice(0, PREVIEW_COLUMNS),
    [sheet.headers],
  );
  const extraColumnCount = Math.max(0, sheet.headers.length - previewHeaders.length);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <MetaBlock label="Purpose">{sheet.purpose || "—"}</MetaBlock>
        <MetaBlock label="Search hints">{sheet.searchHints || "—"}</MetaBlock>
        <MetaBlock label="Search mode">
          <Badge variant="outline" className="capitalize">
            {sheet.searchMode}
          </Badge>
        </MetaBlock>
        <MetaBlock label="Languages">
          <ChipList items={sheet.languages ?? []} uppercase />
        </MetaBlock>
        <MetaBlock label="Keywords">
          <ChipList items={sheet.keywords ?? []} />
        </MetaBlock>
        <MetaBlock label="Columns">
          <ChipList items={sheet.headers} />
        </MetaBlock>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            Rows{" "}
            <span className="font-normal text-muted-foreground">
              ({sheet.rowCount.toLocaleString()} stored)
            </span>
          </p>
          <p className="text-xs text-muted-foreground">Click a row to view full details</p>
        </div>

        {status === "LoadingFirstPage" ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading rows…
          </div>
        ) : results.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No rows stored for this sheet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  {previewHeaders.map((header) => (
                    <TableHead key={header}>{header || "—"}</TableHead>
                  ))}
                  {extraColumnCount > 0 && (
                    <TableHead className="w-24 text-muted-foreground">+{extraColumnCount}</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row) => (
                  <TableRow
                    key={row._id}
                    className="cursor-pointer"
                    onClick={() => onSelectRow(row)}
                  >
                    <TableCell className="tabular-nums text-muted-foreground">
                      {row.rowIndex + 1}
                    </TableCell>
                    {previewHeaders.map((header) => {
                      const value = cellValue(row, header);
                      return (
                        <TableCell key={`${row._id}-${header}`} className="max-w-[14rem]">
                          <span className="line-clamp-2" title={value || undefined}>
                            {value ? truncate(value, 100) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </span>
                        </TableCell>
                      );
                    })}
                    {extraColumnCount > 0 && (
                      <TableCell className="text-xs text-muted-foreground">
                        {row.data.length - previewHeaders.length > 0
                          ? `+${row.data.length - previewHeaders.length} more`
                          : ""}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {status === "CanLoadMore" && (
          <div className="flex justify-center pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => loadMore(ROWS_PAGE_SIZE)}>
              Load more rows
            </Button>
          </div>
        )}
        {status === "LoadingMore" && (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading more…
          </div>
        )}
      </div>
    </div>
  );
}

export function KnowledgeFileBrowserDialog({
  file,
  open,
  onOpenChange,
}: {
  file: KnowledgeFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sheets = useQuery(
    api.assistant.knowledgeFiles.getKnowledgeFileSheets,
    file && open ? { fileId: file._id } : "skip",
  );
  const [selectedSheetId, setSelectedSheetId] = useState<Id<"assistantKnowledgeSheets"> | null>(
    null,
  );
  const [selectedRow, setSelectedRow] = useState<KnowledgeRow | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedSheetId(null);
      setSelectedRow(null);
      return;
    }
    if (sheets && sheets.length > 0 && !selectedSheetId) {
      setSelectedSheetId(sheets[0]!._id);
    }
  }, [open, sheets, selectedSheetId]);

  const selectedSheet = sheets?.find((sheet) => sheet._id === selectedSheetId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92vh,880px)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-2 border-b px-6 py-4 text-left">
          <div className="flex flex-wrap items-center gap-2 pe-8">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            <DialogTitle className="truncate">{file?.fileName ?? "Knowledge file"}</DialogTitle>
            {file?.isActive && <Badge>Active</Badge>}
          </div>
          <DialogDescription>
            Browse stored sheets and rows for this knowledge workbook.
          </DialogDescription>
        </DialogHeader>

        {!file ? null : (
          <div className="grid min-h-0 flex-1 lg:grid-cols-[14rem_1fr]">
            <aside className="border-b lg:border-b-0 lg:border-e">
              <ScrollArea className="h-full max-h-48 lg:max-h-none">
                <div className="space-y-4 p-4">
                  <div className="space-y-3">
                    <MetaBlock label="Summary">
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>
                          {(file.sheetCount ?? 0).toLocaleString()} sheets ·{" "}
                          {(file.rowCount ?? 0).toLocaleString()} rows
                        </p>
                        {(file.languages?.length ?? 0) > 0 && (
                          <ChipList items={file.languages!} uppercase />
                        )}
                      </div>
                    </MetaBlock>
                    {file.description && (
                      <MetaBlock label="Description">
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {file.description}
                        </p>
                      </MetaBlock>
                    )}
                    {file.whenToUse && (
                      <MetaBlock label="When to use">
                        <p className="text-sm text-muted-foreground">{file.whenToUse}</p>
                      </MetaBlock>
                    )}
                    {file.howToSearch && (
                      <MetaBlock label="How to search">
                        <p className="text-sm text-muted-foreground">{file.howToSearch}</p>
                      </MetaBlock>
                    )}
                    {(file.exampleQueries?.length ?? 0) > 0 && (
                      <MetaBlock label="Example queries">
                        <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                          {file.exampleQueries!.map((query) => (
                            <li key={query}>{query}</li>
                          ))}
                        </ul>
                      </MetaBlock>
                    )}
                    {file.toolDescription && (
                      <MetaBlock label="Tool description">
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                          {file.toolDescription}
                        </p>
                      </MetaBlock>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Sheets
                    </p>
                    {sheets === undefined ? (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading…
                      </p>
                    ) : sheets.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No sheets found.</p>
                    ) : (
                      <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                        {sheets.map((sheet) => {
                          const isSelected = sheet._id === selectedSheetId;
                          return (
                            <button
                              key={sheet._id}
                              type="button"
                              onClick={() => {
                                setSelectedSheetId(sheet._id);
                                setSelectedRow(null);
                              }}
                              className={cn(
                                "min-w-[10rem] rounded-md border px-3 py-2 text-start transition-colors lg:min-w-0",
                                isSelected
                                  ? "border-primary bg-primary/5"
                                  : "hover:bg-muted/60",
                              )}
                            >
                              <p className="truncate text-sm font-medium">{sheet.name}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {sheet.rowCount.toLocaleString()} rows · {sheet.searchMode}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </aside>

            <div className="min-h-0 overflow-auto p-0">
              {selectedRow && selectedSheet ? (
                <RowDetailPanel
                  sheetName={selectedSheet.name}
                  row={selectedRow}
                  onClose={() => setSelectedRow(null)}
                />
              ) : selectedSheet ? (
                <div className="space-y-4 p-4 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight">{selectedSheet.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Sheet {selectedSheet.sheetIndex + 1} · {selectedSheet.headers.length} columns
                      </p>
                    </div>
                    <Badge variant="secondary" className="gap-1 font-normal">
                      <Search className="h-3.5 w-3.5" />
                      {selectedSheet.searchMode}
                    </Badge>
                  </div>
                  <SheetRowsPanel
                    key={selectedSheet._id}
                    sheet={selectedSheet}
                    onSelectRow={setSelectedRow}
                  />
                </div>
              ) : sheets === undefined ? (
                <div className="flex h-full items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading sheets…
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Select a sheet to browse its rows.
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
