import { X, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

export interface TableFilter {
  key: string;
  label: string;
  placeholder?: string;
  options: FilterOption[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

interface TableFiltersProps {
  filters: TableFilter[];
  className?: string;
  onClearAll?: () => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}

export function TableFilters({ 
  filters, 
  className, 
  onClearAll,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
}: TableFiltersProps) {
  const activeFilters = filters.filter((f) => f.value);
  const hasSearch = searchValue !== undefined && onSearchChange !== undefined;

  if (filters.length === 0 && !hasSearch) {
    return null;
  }

  const ALL_FILTER_VALUE = "__all__";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {filters.map((filter) => (
        <Select
          key={filter.key}
          value={filter.value ?? ALL_FILTER_VALUE}
          onValueChange={(value) => {
            filter.onChange(value === ALL_FILTER_VALUE ? undefined : value);
          }}
        >
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <SelectValue placeholder={filter.placeholder || filter.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>All {filter.label}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {hasSearch && (
        <>
          <div className="flex-1" />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-9 w-[240px] pl-9 pr-9"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </>
      )}
      {activeFilters.length > 0 && (
        <>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5 flex-wrap">
            {activeFilters.map((filter) => {
              const option = filter.options.find((opt) => opt.value === filter.value);
              return (
                <Badge
                  key={filter.key}
                  variant="secondary"
                  className="h-7 gap-1 px-2 py-0 text-xs"
                >
                  <span className="font-medium">{filter.label}:</span>
                  <span>{option?.label || filter.value}</span>
                  <button
                    type="button"
                    onClick={() => filter.onChange(undefined)}
                    className="ml-0.5 rounded-full hover:bg-destructive/20 hover:text-destructive focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (onClearAll) {
                  onClearAll();
                } else {
                  filters.forEach((filter) => filter.onChange(undefined));
                }
              }}
              className="h-7 px-2 text-xs"
            >
              Clear all
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

