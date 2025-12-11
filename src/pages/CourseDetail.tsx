import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2, GripVertical, Video, FileText, Eye } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { RichTextarea } from "@/components/RichTextarea";
import { VideoUrlInput } from "@/components/VideoUrlInput";
import { courseUpdateSchema } from "../../shared/validation/course";
import { ImageDropzone, type ImageUploadState } from "@/components/ImageDropzone";

type CourseDoc = Doc<"courses">;
type CategoryDoc = Doc<"categories">;
type LessonDoc = Doc<"lessons">;

const formatDuration = (minutes: number | undefined) => {
  if (minutes === undefined || minutes === null) {
    return "—";
  }

  return `${minutes} min`;
};

type FormValues = {
  name: string;
  nameAr: string;
  shortDescription: string;
  shortDescriptionAr: string;
  description: string;
  descriptionAr: string;
  categoryId: string;
  status: CourseDoc["status"];
  trialVideoUrl: string;
};

const initialFormValues: FormValues = {
  name: "",
  nameAr: "",
  shortDescription: "",
  shortDescriptionAr: "",
  description: "",
  descriptionAr: "",
  categoryId: "",
  status: "draft",
  trialVideoUrl: "",
};

const statusLabels: Record<CourseDoc["status"], string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

type SortableLessonItemProps = {
  lesson: LessonDoc;
  index: number;
  onView: (id: Id<"lessons">) => void;
};

const SortableLessonItem = ({ lesson, index, onView }: SortableLessonItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-3 py-2 transition-shadow hover:bg-accent/50",
        isDragging && "shadow-md opacity-50"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-1"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <span className="text-xs font-medium text-muted-foreground w-6 shrink-0">
        #{index + 1}
      </span>
      <span className="text-sm font-medium truncate flex-1 min-w-0">
        {lesson.title}
      </span>
      <Badge variant="secondary" className="gap-1 shrink-0 text-xs h-5">
        {lesson.type === "video" ? (
          <Video className="h-3 w-3" />
        ) : (
          <FileText className="h-3 w-3" />
        )}
        {lesson.type}
      </Badge>
      <span className="text-xs text-muted-foreground w-16 shrink-0 text-right">
        {formatDuration(lesson.duration)}
      </span>
      <Badge
        variant={
          lesson.status === "published"
            ? "default"
            : lesson.status === "archived"
              ? "secondary"
              : "outline"
        }
        className="shrink-0 text-xs h-5"
      >
        {lesson.status}
      </Badge>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onView(lesson._id)}
        className="shrink-0 h-7 w-7"
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

const CourseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const courseId = id as Id<"courses"> | undefined;

  const course = useQuery(
    api.course.getCourse,
    courseId ? { id: courseId } : undefined,
  );
  const categories = useQuery(api.category.listCategories);
  const lessons = useQuery(
    api.lesson.listLessons,
    courseId ? { courseId } : undefined,
  );

  const updateCourse = useMutation(api.course.updateCourse);
  const deleteCourse = useMutation(api.course.deleteCourse);
  const generateImageUploadUrl = useMutation(api.course.generateImageUploadUrl);
  const updateCourseImages = useMutation(api.course.updateCourseImages);
  const generateThumbnail = useAction(api.image.generateThumbnail);
  const convertToJpeg = useAction(api.image.convertToJpeg);
  const reorderLessons = useMutation(api.lesson.reorderLessons);

  const [formValues, setFormValues] = useState<FormValues>(initialFormValues);
  const [initialValues, setInitialValues] = useState<FormValues | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);
  const [coverUploadState, setCoverUploadState] = useState<ImageUploadState>({
    status: "idle",
    progress: 0,
  });
  const coverUploadPromiseRef = useRef<Promise<void> | null>(null);
  const coverUploadResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCoverUrlRef = useRef<string | null>(null);
  const previousCourseIdRef = useRef<Id<"courses"> | undefined>(undefined);

  const categoryList = useMemo<CategoryDoc[]>(() => categories ?? [], [categories]);
  const lessonList = useMemo<LessonDoc[]>(() => {
    if (!lessons) return [];
    // Extract page from paginated result
    return lessons.page ?? [];
  }, [lessons]);
  const isLoading = course === undefined || categories === undefined;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !courseId) {
      return;
    }

    if (active.id === over.id) {
      return;
    }

    const oldIndex = lessonList.findIndex((lesson) => lesson._id === active.id);
    const newIndex = lessonList.findIndex((lesson) => lesson._id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const newOrder = arrayMove(lessonList, oldIndex, newIndex);
    const lessonIds = newOrder.map((lesson) => lesson._id);

    try {
      await reorderLessons({
        courseId,
        lessonIds,
      });
      toast.success("Lessons reordered successfully");
    } catch (error) {
      console.error(error);
      const errorMessage =
        error && typeof error === "object" && "data" in error
          ? (error as { data?: { message?: string } }).data?.message
          : error instanceof Error
            ? error.message
            : "Failed to reorder lessons. Please try again.";
      toast.error(errorMessage);
    }
  };

  useEffect(() => {
    if (!courseId || !course) {
      return;
    }

    const isCourseIdChanged = previousCourseIdRef.current !== courseId;
    const isInitialLoad = initialValues === null;
    
    // Only update form values if:
    // 1. This is the initial load (initialValues is null)
    // 2. The course ID changed (user navigated to a different course)
    // Don't update if course data changed but courseId is the same (e.g., after image upload)
    if (!isInitialLoad && !isCourseIdChanged) {
      previousCourseIdRef.current = courseId;
      return;
    }

    const nextValues: FormValues = {
      name: course.name,
      nameAr: course.name_ar,
      shortDescription: course.short_description ?? "",
      shortDescriptionAr: course.short_description_ar ?? "",
      description: course.description ?? "",
      descriptionAr: course.description_ar ?? "",
      categoryId: course.category_id,
      status: course.status,
      trialVideoUrl: course.trial_video_url ?? "",
    };

    setFormValues((previous) => {
      const prevJson = JSON.stringify(previous);
      const nextJson = JSON.stringify(nextValues);
      if (prevJson === nextJson) {
        return previous;
      }
      return nextValues;
    });

    setInitialValues(nextValues);
    previousCourseIdRef.current = courseId;
  }, [course, courseId, initialValues]);

  useEffect(() => {
    if (!course) {
      return;
    }

    if (!coverImageFile) {
      const nextCoverUrl = course.banner_image_url ?? null;

      if (
        pendingCoverUrlRef.current !== null &&
        pendingCoverUrlRef.current !== nextCoverUrl
      ) {
        // Wait until the server reflects the new cover image URL to avoid reverting the preview.
      } else {
        setCoverImagePreview((previous) => {
          if (previous === nextCoverUrl) {
            return previous;
          }
          if (previous && previous.startsWith("blob:")) {
            URL.revokeObjectURL(previous);
          }
          return nextCoverUrl;
        });

        if (
          pendingCoverUrlRef.current !== null &&
          pendingCoverUrlRef.current === nextCoverUrl
        ) {
          pendingCoverUrlRef.current = null;
        }
      }
    }

  }, [
    course,
    coverImageFile,
    coverImagePreview,
  ]);

  useEffect(() => {
    return () => {
      if (coverImagePreview && coverImagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(coverImagePreview);
      }
    };
  }, [coverImagePreview]);


  useEffect(() => {
    return () => {
      if (coverUploadResetTimeoutRef.current) {
        clearTimeout(coverUploadResetTimeoutRef.current);
      }
    };
  }, []);

  const hasFormChanges = useMemo(() => {
    if (!initialValues) {
      return false;
    }

    return JSON.stringify(initialValues) !== JSON.stringify(formValues);
  }, [formValues, initialValues]);

  const hasChanges =
    hasFormChanges || coverImageFile !== null;

  const isUploadingImages =
    coverUploadState.status === "uploading";

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

  const uploadFileWithProgress = (
    uploadUrl: string,
    file: File,
    onProgress: (progress: number) => void,
  ) =>
    new Promise<{ storageId: string }>((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.responseType = "json";
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        onProgress(0);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            const progress = Math.min(1, event.loaded / event.total);
            onProgress(progress);
          }
        };

        xhr.onerror = () => {
          reject(new Error("Network error while uploading the image."));
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response =
                xhr.response && typeof xhr.response === "object"
                  ? xhr.response
                  : JSON.parse(xhr.responseText);

              if (response && typeof response.storageId === "string") {
                onProgress(1);
                resolve({ storageId: response.storageId });
                return;
              }

              reject(new Error("Upload completed but no storage ID was returned."));
            } catch (parseError) {
              reject(
                parseError instanceof Error
                  ? parseError
                  : new Error("Failed to parse upload response."),
              );
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}.`));
          }
        };

        xhr.send(file);
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("Unexpected error while preparing the upload."),
        );
      }
    });

  const startImageUpload = (file: File) => {
    if (!courseId) {
      toast.error("Invalid course ID.");
      return;
    }

    const setUploadState = setCoverUploadState;
    const uploadPromiseRef = coverUploadPromiseRef;
    const resetTimeoutRef = coverUploadResetTimeoutRef;

    pendingCoverUrlRef.current = null;

    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }

    setUploadState({
      status: "uploading",
      progress: 0,
    });

    const uploadTask = (async () => {
      try {
        // Upload banner image
        const bannerUploadUrl = await generateImageUploadUrl();
        const { storageId: bannerStorageId } = await uploadFileWithProgress(
          bannerUploadUrl,
          file,
          (progress) => {
            // Update progress - 60% for upload, 10% for JPEG conversion, 20% for thumbnail, 10% for update
            setUploadState({
              status: "uploading",
              progress: progress * 0.6,
            });
          }
        );

        const originalBannerStorageId = bannerStorageId as Id<"_storage">;

        // Convert banner image to JPEG 85% quality (no resize)
        // If this fails, abort the entire upload - don't replace the previous image
        setUploadState({
          status: "uploading",
          progress: 0.65, // 65% done, converting to JPEG
        });
        
        const convertedBannerStorageId = await convertToJpeg({
          storageId: originalBannerStorageId,
          quality: 85,
        });
        
        setUploadState({
          status: "uploading",
          progress: 0.75, // 75% done, conversion complete
        });

        // Generate thumbnail from the converted JPEG
        // If this fails, we can continue without thumbnail, but banner conversion must succeed
        let thumbnailStorageId: Id<"_storage"> | undefined;
        try {
          thumbnailStorageId = await generateThumbnail({
            storageId: convertedBannerStorageId,
          });
          
          setUploadState({
            status: "uploading",
            progress: 0.95, // 95% done, thumbnail generated
          });
        } catch (thumbnailError) {
          console.warn("Failed to generate thumbnail:", thumbnailError);
          // Continue without thumbnail if generation fails, but banner is already converted
        }

        // Update course images with both banner and thumbnail
        // Only update if banner conversion succeeded
        const result = await updateCourseImages({
          id: courseId,
          bannerStorageId: convertedBannerStorageId,
          thumbnailStorageId,
        });

        if (!result) {
          throw new Error("Failed to update the course with the uploaded image.");
        }

        const nextBannerUrl = result.bannerImageUrl ?? null;
        pendingCoverUrlRef.current = nextBannerUrl;
        setCoverImagePreview((previous) => {
          if (previous && previous.startsWith("blob:")) {
            URL.revokeObjectURL(previous);
          }
          return nextBannerUrl;
        });
        setCoverImageFile(null);

        setUploadState({
          status: "success",
          progress: 1,
        });

        resetTimeoutRef.current = setTimeout(() => {
          setUploadState({
            status: "idle",
            progress: 0,
          });
          resetTimeoutRef.current = null;
        }, 1500);
      } catch (error) {
        console.error(error);
        const message = getErrorMessage(error);
        setUploadState({
          status: "error",
          progress: 0,
          errorMessage: message,
        });
        pendingCoverUrlRef.current = null;
        toast.error(message);
        throw error;
      } finally {
        uploadPromiseRef.current = null;
      }
    })();

    uploadPromiseRef.current = uploadTask;
    uploadTask.catch(() => {
      // Swallow rejection to avoid unhandled promise rejection warnings.
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!courseId) {
      toast.error("Invalid course ID.");
      return;
    }

    const validation = courseUpdateSchema.safeParse({
      name: formValues.name,
      nameAr: formValues.nameAr,
      shortDescription: formValues.shortDescription,
      shortDescriptionAr: formValues.shortDescriptionAr,
      description: formValues.description,
      descriptionAr: formValues.descriptionAr,
      categoryId: formValues.categoryId,
      status: formValues.status,
      trialVideoUrl: formValues.trialVideoUrl,
    });

    if (!validation.success) {
      // Prioritize required field errors over optional field errors
      const requiredFieldPaths = ["name", "nameAr", "shortDescription", "shortDescriptionAr", "categoryId"];
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
      name,
      nameAr,
      shortDescription,
      shortDescriptionAr,
      description,
      descriptionAr,
      categoryId,
      status,
      trialVideoUrl,
      instructor,
    } = validation.data;

    setIsSaving(true);

    try {
      const pendingUploads = [
        coverUploadPromiseRef.current,
      ].filter((promise): promise is Promise<void> => promise !== null);

      if (pendingUploads.length > 0) {
        try {
          await Promise.all(pendingUploads);
        } catch {
          toast.error("Please resolve the image upload error before saving.");
          return;
        }
      }

      if (coverUploadState.status === "error") {
        toast.error("Please resolve the image upload error before saving.");
        return;
      }

      await updateCourse({
        id: courseId,
        name,
        nameAr,
        shortDescription,
        shortDescriptionAr,
        description,
        descriptionAr,
        categoryId: categoryId as Id<"categories">,
        status,
        trialVideoUrl,
      });

      toast.success("Course updated successfully");
      const savedValues: FormValues = {
        name,
        nameAr,
        shortDescription: shortDescription ?? "",
        shortDescriptionAr: shortDescriptionAr ?? "",
        description: description ?? "",
        descriptionAr: descriptionAr ?? "",
        categoryId,
        status,
        trialVideoUrl: trialVideoUrl ?? "",
      };
      setInitialValues(savedValues);
      setFormValues(savedValues);
      setCoverImageFile(null);
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCourse = async () => {
    if (!courseId) {
      toast.error("Invalid course ID.");
      return;
    }

    setIsDeleting(true);

    try {
      await deleteCourse({ id: courseId });
      toast.success("Course deleted successfully");
      navigate("/courses");
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const handleCoverImageSelect = (file: File) => {
    const nextUrl = URL.createObjectURL(file);
    setCoverImageFile(file);
    pendingCoverUrlRef.current = null;
    setCoverImagePreview((previous) => {
      if (previous && previous.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return nextUrl;
    });
    startImageUpload(file);
  };


  if (!courseId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Invalid course identifier.
        </p>
      </div>
    );
  }

  if (course === undefined || categories === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading course…</p>
      </div>
    );
  }

  if (course === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-2 text-center">
          <p className="text-lg font-medium">Course not found</p>
          <p className="text-sm text-muted-foreground">
            The course you&apos;re looking for does not exist or was removed.
          </p>
          <Button variant="cta" onClick={() => navigate("/courses")}>
            Back to courses
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/courses")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Course details</h1>
            <p className="text-muted-foreground mt-1">
              Update content, metadata, and status for this course.
            </p>
          </div>
        </div>
        <Badge variant={course.status === "published" ? "default" : "secondary"}>
          {statusLabels[course.status]}
        </Badge>
      </div>

      <Tabs defaultValue="details" className="space-y-6">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="lessons" className="gap-2">
            Lessons
            {lessonList.length > 0 && (
              <span className="ml-1 rounded-full bg-secondary px-1.5 py-0.5 text-xs font-medium">
                {lessonList.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardContent className="grid gap-6 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Title (EN)</Label>
                <Input
                  id="name"
                  value={formValues.name}
                  onChange={(event) =>
                    setFormValues((prev) => ({ ...prev, name: event.target.value }))
                  }
                  required
                  maxLength={64}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nameAr">Title (AR)</Label>
                <Input
                  id="nameAr"
                  value={formValues.nameAr}
                  onChange={(event) =>
                    setFormValues((prev) => ({ ...prev, nameAr: event.target.value }))
                  }
                  required
                  maxLength={64}
                  dir="rtl"
                  className="text-right"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
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
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formValues.status}
                  onValueChange={(value: CourseDoc["status"]) =>
                    setFormValues((prev) => ({ ...prev, status: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="grid gap-6 md:grid-cols-2">
              <RichTextarea
                id="shortDescription"
                label="Short description (EN)"
                value={formValues.shortDescription}
                onChange={(nextValue) =>
                  setFormValues((prev) => ({
                    ...prev,
                    shortDescription: nextValue,
                  }))
                }
                required
                maxLength={512}
                rows={3}
                modalTitle="Edit short description"
              />
              <RichTextarea
                id="shortDescriptionAr"
                label="Short description (AR)"
                value={formValues.shortDescriptionAr}
                onChange={(nextValue) =>
                  setFormValues((prev) => ({
                    ...prev,
                    shortDescriptionAr: nextValue,
                  }))
                }
                required
                maxLength={512}
                rows={3}
                dir="rtl"
                textareaClassName="text-right"
                modalTitle="Edit short description"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <RichTextarea
                id="description"
                label="Full description (EN)"
                value={formValues.description}
                onChange={(nextValue) =>
                  setFormValues((prev) => ({
                    ...prev,
                    description: nextValue,
                  }))
                }
                maxLength={4096}
                rows={5}
                modalTitle="Edit full description"
              />
              <RichTextarea
                id="descriptionAr"
                label="Full description (AR)"
                value={formValues.descriptionAr}
                onChange={(nextValue) =>
                  setFormValues((prev) => ({
                    ...prev,
                    descriptionAr: nextValue,
                  }))
                }
                maxLength={4096}
                rows={5}
                dir="rtl"
                textareaClassName="text-right"
                modalTitle="Edit full description"
              />
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <VideoUrlInput
                id="trialVideoUrl"
                value={formValues.trialVideoUrl}
                onChange={(value) =>
                  setFormValues((prev) => ({
                    ...prev,
                    trialVideoUrl: value,
                  }))
                }
                placeholder="https://vimeo.com/..."
                maxLength={2048}
              />
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  {course.duration !== undefined && course.duration !== null
                    ? formatDuration(course.duration)
                    : "Calculated automatically from lessons"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Lesson durations control this value automatically.
                </p>
              </div>
            </div>

            <div className="max-w-2xl">
              <ImageDropzone
                id="coverImage"
                label="Cover image"
                helperText="16:9 ratio. Click to browse or drop an image. The center will be cropped automatically."
                aspectRatioClass="aspect-video"
                value={coverImagePreview}
                onSelectFile={handleCoverImageSelect}
                uploadState={coverUploadState}
                onRetry={
                  coverImageFile ? () => startImageUpload(coverImageFile) : undefined
                }
                disabled={isSaving}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="secondary"
            className="sm:w-auto"
            onClick={() => navigate("/courses")}
          >
            Back
          </Button>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete course
            </Button>
            <Button
              type="submit"
              variant="cta"
              className={cn(
                "w-full sm:w-auto font-semibold transition-opacity",
                isSaving || !hasChanges || isUploadingImages
                  ? "opacity-60"
                  : "opacity-100",
              )}
              disabled={isSaving || !hasChanges || isUploadingImages}
            >
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </form>
        </TabsContent>

        <TabsContent value="lessons" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Lessons</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Drag and drop to reorder lessons
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate(`/lessons?course=${courseId}`)}
            >
              Manage Lessons
            </Button>
          </div>

          {lessons === undefined ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Loading lessons…</p>
            </div>
          ) : lessonList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg">
              <p className="text-sm text-muted-foreground mb-4">
                No lessons yet. Create lessons from the Lessons page.
              </p>
              <Button
                variant="outline"
                onClick={() => navigate(`/lessons?course=${courseId}`)}
              >
                Go to Lessons
              </Button>
            </div>
          ) : (
            <div className="border rounded-lg p-4 bg-muted/30">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={lessonList.map((lesson) => lesson._id)}
                  strategy={verticalListSortingStrategy}
                >
                <div className="space-y-1.5">
                  {lessonList.map((lesson, index) => (
                    <SortableLessonItem
                      key={lesson._id}
                      lesson={lesson}
                      index={index}
                      onView={(id) => navigate(`/lessons/${id}`)}
                    />
                  ))}
                </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete course?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <span className="font-medium text-foreground">{course.name}</span> and
              all of its content for everyone. You can&apos;t undo this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteCourse}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CourseDetail;
