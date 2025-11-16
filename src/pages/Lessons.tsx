import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Trash2, Eye } from "lucide-react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { DataTable, type TableColumn, type TableAction } from "@/components/DataTable";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RichTextarea } from "@/components/RichTextarea";
import { CourseCombobox } from "@/components/CourseCombobox";
import { lessonInputSchema } from "../../shared/validation/lesson";
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

type LessonDoc = Doc<"lessons">;
type CourseDoc = Doc<"courses">;

const Lessons = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const courseFilter = searchParams.get("course") || undefined;
  const statusFilter = searchParams.get("status") || undefined;
  const searchFilter = searchParams.get("search") || undefined;

  const lessons = useQuery(api.lesson.listLessons, {
    courseId: courseFilter as Id<"courses"> | undefined,
    status: statusFilter as "draft" | "published" | "archived" | undefined,
    search: searchFilter,
  });
  const courses = useQuery(api.course.listCourses, {});
  const createLesson = useMutation(api.lesson.createLesson);
  const deleteLesson = useMutation(api.lesson.deleteLesson);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [lessonToDelete, setLessonToDelete] = useState<LessonDoc | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchInput, setSearchInput] = useState(searchFilter || "");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [formValues, setFormValues] = useState({
    title: "",
    titleAr: "",
    courseId: courseFilter || "",
    duration: "",
  });

  const courseList = useMemo<CourseDoc[]>(() => courses ?? [], [courses]);
  const lessonList = useMemo<LessonDoc[]>(() => lessons ?? [], [lessons]);
  const isLoading = lessons === undefined || courses === undefined;

  // Sync courseId with courseFilter when filter changes
  useEffect(() => {
    if (courseFilter) {
      setFormValues((prev) => {
        if (prev.courseId !== courseFilter) {
          return { ...prev, courseId: courseFilter };
        }
        return prev;
      });
    }
  }, [courseFilter]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validation = lessonInputSchema.safeParse({
      title: formValues.title,
      titleAr: formValues.titleAr,
      shortReview: "",
      shortReviewAr: "",
      courseId: formValues.courseId,
      duration: formValues.duration,
      type: "video",
    });

    if (!validation.success) {
      // Prioritize required field errors over optional field errors
      const requiredFieldPaths = ["title", "titleAr", "courseId"];
      const errors = validation.error.errors;
      
      // Find first error for a required field, or fall back to first error
      const requiredFieldError = errors.find(err => 
        err.path && requiredFieldPaths.includes(String(err.path[0]))
      );
      
      const issue = requiredFieldError ?? errors[0];
      toast.error(issue?.message ?? "Please check the form and try again.");
      return;
    }

    const {
      title,
      titleAr,
      shortReview,
      shortReviewAr,
      courseId,
      duration,
    } = validation.data;

    setIsCreating(true);

    try {
      const lessonId = await createLesson({
        title,
        titleAr,
        shortReview,
        shortReviewAr,
        courseId: courseId as Id<"courses">,
        duration,
        type: "video",
      });

      toast.success("Lesson created successfully");
      setIsDialogOpen(false);
      setFormValues({
        title: "",
        titleAr: "",
        courseId: courseFilter || "",
        duration: "",
      });
      navigate(`/lessons/${lessonId}`);
    } catch (error) {
      console.error(error);
      const errorMessage =
        error && typeof error === "object" && "data" in error
          ? (error as { data?: { message?: string } }).data?.message
          : error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

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

  const getCourseName = (courseId: Id<"courses">) => {
    const course = courseList.find((c) => c._id === courseId);
    return course?.name ?? "Unknown";
  };

  const formatDuration = (minutes: number | undefined) => {
    if (!minutes) return "—";
    return `${minutes} min`;
  };

  const courseFilterOptions = useMemo(() => {
    return courseList.map((course) => ({
      value: course._id,
      label: course.name,
    }));
  }, [courseList]);

  const statusFilterOptions = useMemo(() => [
    { value: "draft", label: "Draft" },
    { value: "published", label: "Published" },
    { value: "archived", label: "Archived" },
  ], []);

  const filters: TableFilter[] = useMemo(() => [
    {
      key: "course",
      label: "Course",
      placeholder: "All courses",
      options: courseFilterOptions,
        value: courseFilter,
        onChange: (value) => {
          const newParams = new URLSearchParams(searchParams);
          if (value) {
            newParams.set("course", value);
          } else {
            newParams.delete("course");
          }
          setSearchParams(newParams, { replace: true });
        },
    },
    {
      key: "status",
      label: "Status",
      placeholder: "All statuses",
      options: statusFilterOptions,
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
  ], [courseFilterOptions, courseFilter, statusFilter, searchParams, setSearchParams]);

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
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        const value = searchInput.trim();
        if (value) {
          newParams.set("search", value);
        } else {
          newParams.delete("search");
        }
        return newParams;
      }, { replace: true });
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchInput, setSearchParams]);

  const handleClearAllFilters = useCallback(() => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("course");
    newParams.delete("status");
    newParams.delete("search");
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const columns = useMemo<TableColumn<LessonDoc>[]>(
    () => [
      {
        header: "Thumbnail",
        render: (lesson) => (
          <div className="w-16 h-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
            {lesson.thumbnail_image_url ? (
              <img
                src={lesson.thumbnail_image_url}
                alt={lesson.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                No image
              </div>
            )}
          </div>
        ),
        cellClassName: "w-20",
      },
      {
        header: "Title",
        render: (lesson) => (
          <span className="font-medium">{lesson.title}</span>
        ),
      },
      {
        header: "Course",
        render: (lesson) => {
          const course = courseList.find((c) => c._id === lesson.course_id);
          return (
            <span className="text-muted-foreground">
              {course?.name ?? "Unknown"}
            </span>
          );
        },
        cellClassName: "text-muted-foreground",
      },
      {
        header: "Duration",
        render: (lesson) => formatDuration(lesson.duration),
      },
      {
        header: "Status",
        render: (lesson) => (
          <Badge
            variant={
              lesson.status === "published"
                ? "default"
                : lesson.status === "archived"
                  ? "secondary"
                  : "outline"
            }
          >
            {lesson.status}
          </Badge>
        ),
      },
    ],
    [courseList]
  );

  const actions = useMemo<TableAction<LessonDoc>[]>(
    () => [
      {
        icon: Eye,
        label: "View lesson",
        onClick: (lesson) => navigate(`/lessons/${lesson._id}`),
      },
      {
        icon: Trash2,
        label: "Delete lesson",
        onClick: setLessonToDelete,
        className: "text-destructive",
      },
    ],
    [navigate]
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lessons</h1>
          <p className="text-muted-foreground mt-2">
            Manage individual lessons for your courses
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setFormValues({
                  title: "",
                  titleAr: "",
                  courseId: courseFilter || "",
                  duration: "",
                });
              }}
              variant="cta"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Lesson
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Lesson</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title (EN)</Label>
                  <Input
                    id="title"
                    value={formValues.title}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, title: e.target.value }))
                    }
                    maxLength={128}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="titleAr">Title (AR)</Label>
                  <Input
                    id="titleAr"
                    value={formValues.titleAr}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, titleAr: e.target.value }))
                    }
                    maxLength={128}
                    dir="rtl"
                    className="text-right"
                  />
                </div>
              </div>

              {!courseFilter && (
                <div className="space-y-2">
                  <Label htmlFor="courseId">Course</Label>
                  <CourseCombobox
                    courses={courseList}
                    value={formValues.courseId}
                    onValueChange={(value) =>
                      setFormValues((prev) => ({ ...prev, courseId: value }))
                    }
                    placeholder="Select course"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Input
                  id="duration"
                  value={formValues.duration}
                  onChange={(e) => {
                    const rawValue = e.target.value;
                    const sanitizedValue = rawValue.replace(/\D/g, "");
                    const maxValue = 99999;
                    const clampedValue = sanitizedValue === "" 
                      ? "" 
                      : Math.min(Number(sanitizedValue), maxValue).toString();
                    setFormValues((prev) => ({
                      ...prev,
                      duration: clampedValue,
                    }));
                  }}
                  inputMode="numeric"
                  pattern="^[0-9]*$"
                  placeholder="e.g., 15"
                  max={99999}
                />
              </div>

              <Button
                type="submit"
                variant="cta"
                className="w-full"
                disabled={isCreating}
              >
                {isCreating ? "Creating…" : "Create Lesson"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable
        data={lessonList}
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getItemId={(lesson) => lesson._id}
        loadingMessage="Loading lessons…"
        emptyMessage={
          courseFilter || statusFilter || searchFilter
            ? "No lessons found with the selected filters."
            : "No lessons yet. Create your first lesson to get started."
        }
        filters={filters}
        onClearAllFilters={handleClearAllFilters}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Search lessons by title..."
      />

      <AlertDialog
        open={lessonToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLessonToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lesson?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-medium text-foreground">
                {lessonToDelete?.title ?? "this lesson"}
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
                if (!lessonToDelete) {
                  return;
                }
                setIsDeleting(true);

                try {
                  await deleteLesson({ id: lessonToDelete._id });
                  toast.success("Lesson deleted successfully");
                  setLessonToDelete(null);
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

export default Lessons;
