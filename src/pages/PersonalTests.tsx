import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Plus, Eye, Pencil, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  type TableColumn,
  type TableAction,
} from "@/components/DataTable";
import { type TableFilter } from "@/components/TableFilters";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { personalTestCreateSchema } from "../../shared/validation/personalTest";

type TestListItem = {
  _id: Id<"personalTests">;
  _creationTime: number;
  name: string;
  name_ar: string;
  status: "draft" | "published" | "disabled";
  questionCount: number;
  createdAt: number;
  updatedAt: number;
  hasPublishedSnapshot: boolean;
  hasUnpublishedChanges: boolean;
};

function getEffectiveStatus(test: Pick<TestListItem, "status" | "hasPublishedSnapshot">) {
  if (test.status === "draft" && test.hasPublishedSnapshot) {
    return "published" as const;
  }
  return test.status;
}

const statusLabels: Record<TestListItem["status"], string> = {
  draft: "Draft",
  published: "Published",
  disabled: "Disabled",
};

const statusVariants: Record<
  TestListItem["status"],
  "secondary" | "default" | "outline"
> = {
  draft: "secondary",
  published: "default",
  disabled: "outline",
};

const PersonalTests = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") || undefined;
  const searchFilter = searchParams.get("search") || undefined;

  const PAGE_SIZE = 12;
  const [searchInput, setSearchInput] = useState(searchFilter || "");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [paginatedTests, setPaginatedTests] = useState<TestListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [continueCursor, setContinueCursor] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [cursorScope, setCursorScope] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [testToDelete, setTestToDelete] = useState<TestListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filterKey = useMemo(
    () => `${statusFilter ?? ""}|${searchFilter ?? ""}`,
    [statusFilter, searchFilter],
  );

  const testsPage = useQuery(api.personalTest.listPersonalTests, {
    status: statusFilter as TestListItem["status"] | undefined,
    search: searchFilter,
    limit: PAGE_SIZE,
    cursor: cursor !== null && cursorScope === filterKey ? cursor : undefined,
  });

  const createTest = useMutation(api.personalTest.createPersonalTest);
  const deleteTest = useMutation(api.personalTest.deletePersonalTest);

  useEffect(() => {
    setSearchInput(searchFilter || "");
  }, [searchFilter]);

  useEffect(() => {
    setCursor(null);
    setContinueCursor(null);
    setIsDone(false);
    setPaginatedTests([]);
    setCursorScope(null);
  }, [filterKey]);

  useEffect(() => {
    if (!testsPage) return;

    setContinueCursor(testsPage.continueCursor);
    setIsDone(testsPage.isDone);
    setCursorScope(filterKey);

    setPaginatedTests((prev) => {
      if (cursor === null || cursorScope !== filterKey) {
        return testsPage.page;
      }
      const existingIds = new Set(prev.map((t) => t._id));
      const newItems = testsPage.page.filter((t) => !existingIds.has(t._id));
      return [...prev, ...newItems];
    });
    setIsLoadingMore(false);
  }, [testsPage, cursor, cursorScope, filterKey]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams);
        if (value.trim()) {
          params.set("search", value.trim());
        } else {
          params.delete("search");
        }
        setSearchParams(params, { replace: true });
      }, 300);
    },
    [searchParams, setSearchParams],
  );

  const handleStatusFilterChange = useCallback(
    (value: string | undefined) => {
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set("status", value);
      } else {
        params.delete("status");
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleClearAllFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
    setSearchInput("");
  }, [setSearchParams]);

  const handleLoadMore = () => {
    if (continueCursor && !isDone && !isLoadingMore) {
      setIsLoadingMore(true);
      setCursor(continueCursor);
    }
  };

  const resetCreateForm = () => {
    setName("");
    setNameAr("");
  };

  const handleCreate = async (event?: FormEvent) => {
    event?.preventDefault();
    const result = personalTestCreateSchema.safeParse({ name, nameAr });
    if (!result.success) {
      toast.error(result.error.errors[0]?.message ?? "Invalid input.");
      return;
    }

    setIsSaving(true);
    try {
      const testId = await createTest({
        name: result.data.name,
        nameAr: result.data.nameAr,
      });
      toast.success("Test created.");
      setIsDialogOpen(false);
      resetCreateForm();
      navigate(`/personal-tests/${testId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create test.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!testToDelete) return;
    setIsDeleting(true);
    try {
      await deleteTest({ testId: testToDelete._id });
      toast.success("Test deleted.");
      setTestToDelete(null);
      setPaginatedTests((prev) => prev.filter((t) => t._id !== testToDelete._id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete test.");
    } finally {
      setIsDeleting(false);
    }
  };

  const filters = useMemo<TableFilter[]>(
    () => [
      {
        id: "status",
        label: "Status",
        value: statusFilter,
        placeholder: "All statuses",
        options: [
          { label: "Draft", value: "draft" },
          { label: "Published", value: "published" },
          { label: "Disabled", value: "disabled" },
        ],
        onChange: handleStatusFilterChange,
      },
    ],
    [statusFilter, handleStatusFilterChange],
  );

  const columns = useMemo<TableColumn<TestListItem>[]>(
    () => [
      {
        header: "Test name",
        render: (test) => (
          <div>
            <span className="font-medium">{test.name}</span>
            <span className="block text-xs text-muted-foreground">{test.name_ar}</span>
          </div>
        ),
      },
      {
        header: "Questions",
        render: (test) => test.questionCount,
      },
      {
        header: "Status",
        render: (test) => {
          const effectiveStatus = getEffectiveStatus(test);
          return (
          <div className="flex flex-col items-start gap-1">
            <Badge variant={statusVariants[effectiveStatus]} className="w-fit">
              {statusLabels[effectiveStatus]}
            </Badge>
            {test.hasUnpublishedChanges && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Unpublished changes
              </span>
            )}
          </div>
          );
        },
      },
      {
        header: "Created",
        render: (test) => format(new Date(test.createdAt), "PP"),
        cellClassName: "text-muted-foreground",
      },
    ],
    [],
  );

  const actions = useMemo<TableAction<TestListItem>[]>(
    () => [
      {
        icon: Eye,
        label: "View test",
        onClick: (test) => navigate(`/personal-tests/${test._id}`),
      },
      {
        icon: Pencil,
        label: "Edit test",
        onClick: (test) => navigate(`/personal-tests/${test._id}`),
      },
      {
        icon: Trash2,
        label: "Delete test",
        onClick: setTestToDelete,
        className: "text-destructive",
      },
    ],
    [navigate],
  );

  const isLoading = testsPage === undefined && paginatedTests.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Personal Tests</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage recommendation-based personal tests.
          </p>
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetCreateForm();
          }}
        >
          <DialogTrigger asChild>
            <Button variant="cta">
              <Plus className="mr-2 h-4 w-4" />
              Create test
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create personal test</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="test-name">Name</Label>
                <Input
                  id="test-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Test name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-name-ar">Name (Arabic)</Label>
                <Input
                  id="test-name-ar"
                  value={nameAr}
                  dir="rtl"
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder="اسم الاختبار"
                />
              </div>
              <Button type="submit" variant="cta" disabled={isSaving} className="w-full">
                {isSaving ? "Creating…" : "Create test"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        data={paginatedTests}
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getItemId={(test) => test._id}
        emptyMessage="No personal tests yet."
        filters={filters}
        onClearAllFilters={handleClearAllFilters}
        searchValue={searchInput}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search tests…"
      />

      {!isDone && paginatedTests.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={handleLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}

      <AlertDialog open={!!testToDelete} onOpenChange={() => setTestToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete test?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{testToDelete?.name}&rdquo; and all its
              questions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PersonalTests;
