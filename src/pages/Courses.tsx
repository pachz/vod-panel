import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Eye, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type TableColumn,
  type TableAction,
  getPreviewText,
} from "@/components/DataTable";
import { type TableFilter } from "@/components/TableFilters";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import { courseInputSchema } from "../../shared/validation/course";
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

type CourseDoc = Doc<"courses">;
type CategoryDoc = Doc<"categories">;

type FormValues = {
  name: string;
  nameAr: string;
  categoryId: string;
};

const initialFormValues: FormValues = {
  name: "",
  nameAr: "",
  categoryId: "",
};

const formatDuration = (minutes: number | undefined) => {
  if (minutes === undefined || minutes === null) {
    return "—";
  }

  return `${minutes} min`;
};

const Courses = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFilter = searchParams.get("category") || undefined;
  const statusFilter = searchParams.get("status") || undefined;
  const searchFilter = searchParams.get("search") || undefined;

  const PAGE_SIZE = 12;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formValues, setFormValues] = useState<FormValues>(initialFormValues);
  const [courseToDelete, setCourseToDelete] = useState<CourseDoc | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchInput, setSearchInput] = useState(searchFilter || "");

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [paginatedCourses, setPaginatedCourses] = useState<CourseDoc[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [continueCursor, setContinueCursor] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [cursorScope, setCursorScope] = useState<string | null>(null);

  const filterKey = useMemo(
    () => `${categoryFilter ?? ""}|${statusFilter ?? ""}|${searchFilter ?? ""}`,
    [categoryFilter, statusFilter, searchFilter]
  );

  const coursesPage = useQuery(api.course.listCourses, {
    categoryId: categoryFilter as Id<"categories"> | undefined,
    status: statusFilter as "draft" | "published" | "archived" | undefined,
    search: searchFilter,
    limit: PAGE_SIZE,
    cursor: cursor !== null && cursorScope === filterKey ? cursor : undefined,
  });
  const categories = useQuery(api.category.listCategories);
  const createCourse = useMutation(api.course.createCourse);
  const deleteCourse = useMutation(api.course.deleteCourse);

  const resetForm = useCallback(() => {
    setFormValues(() => ({ ...initialFormValues }));
  }, []);

  // Sync search input with URL param when it changes externally
  useEffect(() => {
    setSearchInput(searchFilter || "");
  }, [searchFilter]);

  // Debounce search input updates
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const newParams = new URLSearchParams(prev);
          const value = searchInput.trim();
          if (value) {
            newParams.set("search", value);
          } else {
            newParams.delete("search");
          }
          return newParams;
        },
        { replace: true }
      );
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchInput, setSearchParams]);

  // Reset pagination when filters/search change
  useEffect(() => {
    setPaginatedCourses([]);
    setCursor(null);
    setContinueCursor(null);
    setIsDone(false);
    setCursorScope(null);
    setIsLoadingMore(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, statusFilter, searchFilter]);

  // Append new page results
  useEffect(() => {
    if (!coursesPage) return;

    const {
      page,
      continueCursor: nextCursor,
      isDone: nextIsDone,
    } = coursesPage;

    setPaginatedCourses((prev) => {
      // If this is the first page, replace. Otherwise append deduped.
      if (!cursor) return page;
      const existingIds = new Set(prev.map((c) => c._id));
      const merged = [...prev];
      page.forEach((c) => {
        if (!existingIds.has(c._id)) merged.push(c);
      });
      return merged;
    });
    setContinueCursor(nextCursor ?? null);
    setIsDone(Boolean(nextIsDone) || !nextCursor);
    setIsLoadingMore(false);
  }, [coursesPage, cursor]);

  const canLoadMore = !isDone && Boolean(continueCursor);
  // Only show loading on initial load (when we have no data yet), not when loading more
  const isLoading = coursesPage === undefined && paginatedCourses.length === 0;

  const categoryList = useMemo<CategoryDoc[]>(
    () => categories ?? [],
    [categories]
  );
  const handleLoadMore = useCallback(() => {
    if (!canLoadMore || isLoadingMore) return;
    setIsLoadingMore(true);
    setCursorScope(filterKey);
    setCursor(continueCursor);
  }, [canLoadMore, continueCursor, filterKey, isLoadingMore]);

  const categoryNameById = useMemo(() => {
    return categoryList.reduce<Record<string, string>>((acc, category) => {
      acc[category._id] = category.name;
      return acc;
    }, {});
  }, [categoryList]);

  const columns = useMemo<TableColumn<CourseDoc>[]>(
    () => [
      {
        header: "Thumbnail",
        headerClassName: "w-[100px]",
        render: (course) =>
          course.thumbnail_image_url ? (
            <img
              src={course.thumbnail_image_url}
              alt={course.name}
              className="h-16 w-24 rounded object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-16 w-24 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
              No image
            </div>
          ),
      },
      {
        header: "Name",
        render: (course) => <span className="font-medium">{course.name}</span>,
      },
      {
        header: "Category",
        render: (course) => (
          <span className="text-muted-foreground">
            {categoryNameById[course.category_id] ?? "—"}
          </span>
        ),
        cellClassName: "text-muted-foreground",
      },
      {
        header: "Description",
        render: (course) => (
          <span className="text-muted-foreground">
            {getPreviewText(course.short_description)}
          </span>
        ),
        cellClassName: "text-muted-foreground",
      },
      {
        header: "Duration",
        render: (course) => (
          <span className="text-muted-foreground">
            {formatDuration(course.duration)}
          </span>
        ),
        cellClassName: "text-muted-foreground",
      },
      {
        header: "Status",
        render: (course) => (
          <Badge
            variant={course.status === "published" ? "default" : "secondary"}
          >
            {course.status}
          </Badge>
        ),
      },
    ],
    [categoryNameById]
  );

  const actions = useMemo<TableAction<CourseDoc>[]>(
    () => [
      {
        icon: Eye,
        label: "View course",
        onClick: (course) => navigate(`/courses/${course._id}`),
      },
      {
        icon: Trash2,
        label: "Delete course",
        onClick: setCourseToDelete,
        className: "text-destructive",
      },
    ],
    [navigate]
  );

  const handleClearAll = useCallback(() => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("category");
    newParams.delete("status");
    newParams.delete("search");
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const filters = useMemo<TableFilter[]>(
    () => [
      {
        key: "category",
        label: "Category",
        placeholder: "All categories",
        options: categoryList.map((category) => ({
          value: category._id,
          label: category.name,
        })),
        value: categoryFilter,
        onChange: (value) => {
          const newParams = new URLSearchParams(searchParams);
          if (value) {
            newParams.set("category", value);
          } else {
            newParams.delete("category");
          }
          setSearchParams(newParams, { replace: true });
        },
      },
      {
        key: "status",
        label: "Status",
        placeholder: "All statuses",
        options: [
          { value: "published", label: "Published" },
          { value: "draft", label: "Draft" },
          { value: "archived", label: "Archived" },
        ],
        value: statusFilter,
        onChange: (value) => {
          const newParams = new URLSearchParams(searchParams);
          if (value) {
            newParams.set("status", value);
          } else {
            newParams.delete("status");
          }
          setSearchParams(newParams, { replace: true });
        },
      },
    ],
    [categoryList, categoryFilter, statusFilter, searchParams, setSearchParams]
  );

  const getErrorMessage = (error: unknown) => {
    if (error && typeof error === "object" && "data" in error) {
      const data = (error as { data?: { message?: string } }).data;
      if (data?.message) {
        return data.message;
      }
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return "Something went wrong. Please try again.";
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validation = courseInputSchema.safeParse(formValues);

    if (!validation.success) {
      // Prioritize required field errors over optional field errors
      const requiredFieldPaths = ["name", "nameAr", "categoryId"];
      const errors = validation.error.errors;

      // Find first error for a required field, or fall back to first error
      const requiredFieldError = errors.find(
        (err) => err.path && requiredFieldPaths.includes(String(err.path[0]))
      );

      const issue = requiredFieldError ?? errors[0];
      toast.error(issue?.message ?? "Please check the form and try again.");
      return;
    }

    const { name, nameAr, shortDescription, shortDescriptionAr, categoryId } =
      validation.data;

    setIsSaving(true);

    try {
      const courseId = await createCourse({
        name,
        nameAr,
        shortDescription,
        shortDescriptionAr,
        categoryId: categoryId as Id<"categories">,
      });

      toast.success("Course draft created");
      setIsDialogOpen(false);
      resetForm();
      navigate(`/courses/${courseId}`);
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Courses</h1>
          <p className="text-muted-foreground mt-2">
            Manage your course catalog
          </p>
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              resetForm();
              setIsSaving(false);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="cta"
              onClick={() => {
                resetForm();
                setIsDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Course
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Course</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formValues.name}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    maxLength={64}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nameAr">Arabic Name</Label>
                  <Input
                    id="nameAr"
                    name="nameAr"
                    value={formValues.nameAr}
                    onChange={(event) =>
                      setFormValues((prev) => ({
                        ...prev,
                        nameAr: event.target.value,
                      }))
                    }
                    maxLength={64}
                    dir="rtl"
                    className="text-right"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="categoryId">Category</Label>
                  <Select
                    value={formValues.categoryId}
                    onValueChange={(value) =>
                      setFormValues((prev) => ({ ...prev, categoryId: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryList.map((category) => (
                        <SelectItem key={category._id} value={category._id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                type="submit"
                variant="cta"
                className="w-full"
                disabled={isSaving}
              >
                {isSaving ? "Creating…" : "Create Course"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        data={paginatedCourses}
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getItemId={(course) => course._id}
        loadingMessage="Loading courses…"
        emptyMessage={
          categoryFilter || statusFilter || searchFilter
            ? "No courses found with the selected filters."
            : "No courses yet. Create your first course to get started."
        }
        filters={filters}
        onClearAllFilters={handleClearAll}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Search courses by name..."
      />

      {(canLoadMore || isLoading) && (
        <div className="flex items-center justify-center">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={!canLoadMore || isLoadingMore}
            className="min-w-[160px]"
          >
            {isLoadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}

      <AlertDialog
        open={courseToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCourseToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete course?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-medium text-foreground">
                {courseToDelete?.name ?? "this course"}
              </span>{" "}
              for everyone. You can&apos;t undo this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={async () => {
                if (!courseToDelete) {
                  return;
                }
                setIsDeleting(true);

                try {
                  await deleteCourse({ id: courseToDelete._id });
                  toast.success("Course deleted successfully");
                  setCourseToDelete(null);
                } catch (error) {
                  console.error(error);
                  toast.error(getErrorMessage(error));
                } finally {
                  setIsDeleting(false);
                }
              }}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Courses;
