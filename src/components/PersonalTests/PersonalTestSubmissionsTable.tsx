import { useEffect, useMemo, useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { Search, Upload } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ANALYTICS_TIMEZONE,
  formatAnalyticsDateTime,
  formatSubmissionDuration,
} from "../../../shared/validation/personalTestAnalytics";

const PAGE_SIZE = 10;

type PersonalTestSubmissionsTableProps = {
  testId: Id<"personalTests">;
  startDate: string;
  endDate: string;
};

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function getInitials(name?: string) {
  if (!name) {
    return "?";
  }
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function buildSubmissionsCsv(
  rows: Array<{
    userName?: string;
    userEmail?: string;
    completedAt: number;
    durationSeconds?: number;
    selectedAnswerCount: number;
    questionCount: number;
    recommendedCourses: Array<{ name: string }>;
  }>,
) {
  const header =
    "Name,Email,Completed At,Time Taken,Questions Answered,Courses Recommended\n";
  const lines = rows.map((row) =>
    [
      escapeCsv(row.userName ?? ""),
      escapeCsv(row.userEmail ?? ""),
      escapeCsv(formatAnalyticsDateTime(row.completedAt)),
      escapeCsv(formatSubmissionDuration(row.durationSeconds)),
      escapeCsv(`${row.selectedAnswerCount} / ${row.questionCount}`),
      escapeCsv(row.recommendedCourses.map((course) => course.name).join("; ")),
    ].join(","),
  );
  return header + lines.join("\n");
}

function getVisiblePages(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = Array.from(pages)
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);

  const result: Array<number | "ellipsis"> = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const page = sorted[index]!;
    const previous = sorted[index - 1];
    if (previous !== undefined && page - previous > 1) {
      result.push("ellipsis");
    }
    result.push(page);
  }
  return result;
}

export const PersonalTestSubmissionsTable = ({
  testId,
  startDate,
  endDate,
}: PersonalTestSubmissionsTableProps) => {
  const convex = useConvex();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [startDate, endDate]);

  const submissions = useQuery(api.personalTestAttemptAnalytics.listPersonalTestSubmissions, {
    testId,
    startDate,
    endDate,
    search: debouncedSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const visiblePages = useMemo(
    () =>
      submissions ? getVisiblePages(submissions.page, submissions.totalPages) : [],
    [submissions],
  );

  const showingFrom =
    submissions && submissions.totalCount > 0
      ? (submissions.page - 1) * submissions.pageSize + 1
      : 0;
  const showingTo =
    submissions && submissions.totalCount > 0
      ? Math.min(submissions.page * submissions.pageSize, submissions.totalCount)
      : 0;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const rows = await convex.query(
        api.personalTestAttemptAnalytics.exportPersonalTestSubmissions,
        {
          testId,
          startDate,
          endDate,
          search: debouncedSearch || undefined,
        },
      );

      if (rows.length === 0) {
        toast.error("No submissions to export for this range.");
        return;
      }

      const csvContent = buildSubmissionsCsv(rows);
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `test-submissions-${startDate}-to-${endDate}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length.toLocaleString()} submission(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="font-medium">Test submissions</h3>
          <p className="text-sm text-muted-foreground">
            Users who completed the test and their recommended courses ({ANALYTICS_TIMEZONE}).
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by user name or email…"
              className="pl-9"
            />
          </div>
          <Button
            variant="cta"
            className="shrink-0"
            disabled={isExporting}
            onClick={() => void handleExport()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting…" : "Export"}
          </Button>
        </div>
      </div>

      {submissions === undefined ? (
        <p className="p-6 text-sm text-muted-foreground">Loading submissions…</p>
      ) : submissions.totalCount === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">
          No completed submissions in this date range.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Completed at</TableHead>
                  <TableHead>Time taken</TableHead>
                  <TableHead>Questions answered</TableHead>
                  <TableHead>Courses recommended</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.rows.map((row) => (
                  <TableRow key={row.attemptId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={row.userImage} alt={row.userName ?? "User"} />
                          <AvatarFallback>{getInitials(row.userName)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {row.userName ?? "Unknown user"}
                          </p>
                          {row.userEmail && (
                            <p className="truncate text-xs text-muted-foreground">
                              {row.userEmail}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatAnalyticsDateTime(row.completedAt)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatSubmissionDuration(row.durationSeconds)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.selectedAnswerCount} / {row.questionCount}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {row.recommendedCourses.length === 0 ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          row.recommendedCourses.map((course) => (
                            <div
                              key={course.courseId}
                              className="h-10 w-14 overflow-hidden rounded-md border bg-muted"
                              title={course.name}
                            >
                              {course.thumbnail_image_url ? (
                                <img
                                  src={course.thumbnail_image_url}
                                  alt={course.name}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center px-1 text-[10px] text-muted-foreground">
                                  No image
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {showingFrom.toLocaleString()} to {showingTo.toLocaleString()} of{" "}
              {submissions.totalCount.toLocaleString()} results
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={submissions.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                ‹
              </Button>
              {visiblePages.map((item, index) =>
                item === "ellipsis" ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="px-2 text-sm text-muted-foreground"
                  >
                    …
                  </span>
                ) : (
                  <Button
                    key={item}
                    variant={item === submissions.page ? "default" : "outline"}
                    size="icon"
                    className={cn(
                      "h-8 w-8",
                      item === submissions.page &&
                        "bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </Button>
                ),
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={submissions.page >= submissions.totalPages}
                onClick={() =>
                  setPage((current) => Math.min(submissions.totalPages, current + 1))
                }
              >
                ›
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
