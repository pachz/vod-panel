import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableFilters, type TableFilter } from "@/components/TableFilters";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface TableColumn<T> {
  header: string;
  headerClassName?: string;
  render: (item: T) => ReactNode;
  cellClassName?: string;
}

export interface TableAction<T> {
  icon: LucideIcon;
  label: string;
  onClick: (item: T) => void;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  isLoading: boolean;
  columns: TableColumn<T>[];
  actions?: TableAction<T>[];
  getItemId: (item: T) => string;
  loadingMessage?: string;
  emptyMessage?: string;
  filters?: TableFilter[];
  onClearAllFilters?: () => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}

const getPreview = (value: string | null | undefined) => {
  if (!value) {
    return "—";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "—";
  }

  const firstLine = trimmed.split(/\r?\n/)[0] ?? "";
  const maxLength = 80;
  const truncated =
    firstLine.length > maxLength ? firstLine.slice(0, maxLength) : firstLine;
  const needsEllipsis =
    firstLine.length > maxLength || trimmed.length > firstLine.length;

  return `${truncated}${needsEllipsis ? "…" : ""}`;
};

export const getPreviewText = getPreview;

export function DataTable<T>({
  data,
  isLoading,
  columns,
  actions,
  getItemId,
  loadingMessage = "Loading…",
  emptyMessage = "No items yet.",
  filters,
  onClearAllFilters,
  searchValue,
  onSearchChange,
  searchPlaceholder,
}: DataTableProps<T>) {
  const columnCount = columns.length + (actions && actions.length > 0 ? 1 : 0);
  const hasFilters = filters && filters.length > 0;
  const hasSearch = searchValue !== undefined && onSearchChange !== undefined;

  return (
    <div className="space-y-4">
      {(hasFilters || hasSearch) && (
        <div className="rounded-lg border bg-card px-4 py-3">
          <TableFilters 
            filters={filters || []} 
            onClearAll={onClearAllFilters}
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            searchPlaceholder={searchPlaceholder}
          />
        </div>
      )}
      <div className="rounded-lg border bg-card">
        <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column, index) => (
              <TableHead
                key={index}
                className={column.headerClassName}
              >
                {column.header}
              </TableHead>
            ))}
            {actions && actions.length > 0 && (
              <TableHead className="text-right">Actions</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={columnCount}>
                <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                  {loadingMessage}
                </div>
              </TableCell>
            </TableRow>
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount}>
                <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                  {emptyMessage}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            data.map((item) => (
              <TableRow key={getItemId(item)}>
                {columns.map((column, index) => (
                  <TableCell
                    key={index}
                    className={column.cellClassName}
                  >
                    {column.render(item)}
                  </TableCell>
                ))}
                {actions && actions.length > 0 && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {actions.map((action, index) => {
                        const Icon = action.icon;
                        return (
                          <Tooltip key={index}>
                            <TooltipTrigger asChild>
                              <Button
                                variant={action.variant || "ghost"}
                                size="icon"
                                onClick={() => action.onClick(item)}
                                className={action.className}
                                aria-label={action.label}
                              >
                                <Icon className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <span>{action.label}</span>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}

