import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Image as ImageIcon, Trash2 } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";

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
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { RichTextarea } from "@/components/RichTextarea";
import { lessonUpdateSchema } from "../../shared/validation/lesson";

type LessonDoc = Doc<"lessons">;
type CourseDoc = Doc<"courses">;

type FormValues = {
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  learningObjectives: string;
  learningObjectivesAr: string;
  courseId: string;
  duration: string;
  status: LessonDoc["status"];
  videoUrl: string;
};

const initialFormValues: FormValues = {
  title: "",
  titleAr: "",
  description: "",
  descriptionAr: "",
  learningObjectives: "",
  learningObjectivesAr: "",
  courseId: "",
  duration: "",
  status: "draft",
  videoUrl: "",
};

type ImageUploadState = {
  status: "idle" | "uploading" | "success" | "error";
  progress: number;
  errorMessage?: string;
};

type ImageDropzoneProps = {
  id: string;
  label: string;
  helperText?: string;
  aspectRatioClass: string;
  value: string | null;
  onSelectFile: (file: File) => void;
  uploadState?: ImageUploadState;
  onRetry?: () => void;
  disabled?: boolean;
};

const ImageDropzone = ({
  id,
  label,
  helperText,
  aspectRatioClass,
  value,
  onSelectFile,
  uploadState,
  onRetry,
  disabled = false,
}: ImageDropzoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const isUploading = uploadState?.status === "uploading";
  const isDisabled = disabled || isUploading;

  const handleFiles = (files: FileList | null) => {
    if (isDisabled) {
      return;
    }

    if (!files || files.length === 0) {
      return;
    }

    const imageFile = Array.from(files).find((file) => file.type.startsWith("image/"));

    if (!imageFile) {
      toast.warning("Please choose an image file.");
      return;
    }

    onSelectFile(imageFile);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleClick = () => {
    if (isDisabled) {
      return;
    }

    inputRef.current?.click();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled) {
      return;
    }

    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled) {
      return;
    }

    event.preventDefault();
    setIsDragOver(false);
    handleFiles(event.dataTransfer.files);
  };

  return (
    <div className="space-y-2">
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
      <div
        role="button"
        tabIndex={0}
        aria-labelledby={`${id}-label`}
        aria-describedby={helperText ? `${id}-helper-text` : undefined}
        aria-busy={isUploading}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/30 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          aspectRatioClass,
          isDragOver && "border-primary bg-primary/10",
          isDisabled && "cursor-not-allowed opacity-80",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />
        {value ? (
          <>
            <img
              src={value}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end bg-gradient-to-t from-black/50 via-black/0 to-transparent p-4 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              <span>Click or drag to replace</span>
            </div>
          </>
        ) : (
          <div className="pointer-events-none flex flex-col items-center justify-center gap-2 px-6 py-8 text-muted-foreground">
            <ImageIcon className="h-12 w-12" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Click to browse</p>
              <p className="text-xs">or drag and drop an image</p>
            </div>
          </div>
        )}
        {uploadState && uploadState.status !== "idle" ? (
          <div
            className={cn(
              "absolute inset-0 flex flex-col justify-end gap-2 bg-black/60 p-4 text-white transition-opacity",
              uploadState.status === "error" ? "pointer-events-auto" : "pointer-events-none",
            )}
          >
            {uploadState.status === "uploading" ? (
              <>
                <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-white/80">
                  <span>Uploading</span>
                  <span>{Math.round(uploadState.progress * 100)}%</span>
                </div>
                <Progress
                  value={Math.min(100, Math.round(uploadState.progress * 100))}
                  className="h-1 w-full bg-white/30"
                />
              </>
            ) : null}
            {uploadState.status === "success" ? (
              <div className="flex h-8 items-center justify-center rounded-full bg-white/20 text-xs font-medium text-white/90">
                Image updated
              </div>
            ) : null}
            {uploadState.status === "error" ? (
              <div className="flex flex-col gap-2 rounded-lg border border-destructive/50 bg-destructive/60 p-3 text-xs">
                <span className="font-semibold uppercase tracking-wide">
                  Upload failed
                </span>
                {uploadState.errorMessage ? (
                  <span className="text-[11px]/5 text-destructive-foreground/80">
                    {uploadState.errorMessage}
                  </span>
                ) : null}
                {onRetry ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="pointer-events-auto h-7 border-white/30 bg-white/20 text-xs font-semibold text-white shadow-none hover:bg-white/30"
                    onClick={onRetry}
                  >
                    Try again
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {helperText ? (
        <p id={`${id}-helper-text`} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      ) : null}
    </div>
  );
};

const statusLabels: Record<LessonDoc["status"], string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

const LessonDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const lessonId = id as Id<"lessons"> | undefined;

  const lesson = useQuery(
    api.lesson.getLesson,
    lessonId ? { id: lessonId } : undefined,
  );
  const courses = useQuery(api.course.listCourses, {});

  const updateLesson = useMutation(api.lesson.updateLesson);
  const deleteLesson = useMutation(api.lesson.deleteLesson);
  const generateImageUploadUrl = useMutation(api.lesson.generateImageUploadUrl);
  const updateLessonImages = useMutation(api.lesson.updateLessonImages);
  const generateThumbnail = useAction(api.image.generateThumbnail);
  const convertToJpeg = useAction(api.image.convertToJpeg);

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

  const courseList = useMemo<CourseDoc[]>(() => courses ?? [], [courses]);
  const isLoading = lesson === undefined || courses === undefined;

  useEffect(() => {
    if (!lessonId || !lesson) {
      return;
    }

    const nextValues: FormValues = {
      title: lesson.title,
      titleAr: lesson.title_ar,
      description: lesson.description ?? "",
      descriptionAr: lesson.description_ar ?? "",
      learningObjectives: lesson.learning_objectives ?? "",
      learningObjectivesAr: lesson.learning_objectives_ar ?? "",
      courseId: lesson.course_id,
      duration:
        lesson.duration !== undefined && lesson.duration !== null
          ? String(lesson.duration)
          : "",
      status: lesson.status,
      videoUrl: lesson.video_url ?? "",
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
  }, [lesson, lessonId]);

  useEffect(() => {
    if (!lesson) {
      return;
    }

    if (!coverImageFile) {
      const nextCoverUrl = lesson.cover_image_url ?? null;

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
  }, [lesson, coverImageFile, coverImagePreview]);

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

  const hasChanges = hasFormChanges || coverImageFile !== null;

  const isUploadingImages = coverUploadState.status === "uploading";

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
    if (!lessonId) {
      toast.error("Invalid lesson ID.");
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
        // Upload cover image
        const coverUploadUrl = await generateImageUploadUrl();
        const { storageId: coverStorageId } = await uploadFileWithProgress(
          coverUploadUrl,
          file,
          (progress) => {
            setUploadState({
              status: "uploading",
              progress: progress * 0.6,
            });
          }
        );

        const originalCoverStorageId = coverStorageId as Id<"_storage">;

        // Convert cover image to JPEG 85% quality
        setUploadState({
          status: "uploading",
          progress: 0.65,
        });
        
        const convertedCoverStorageId = await convertToJpeg({
          storageId: originalCoverStorageId,
          quality: 85,
        });
        
        setUploadState({
          status: "uploading",
          progress: 0.75,
        });

        // Generate thumbnail from the converted JPEG
        let thumbnailStorageId: Id<"_storage"> | undefined;
        try {
          thumbnailStorageId = await generateThumbnail({
            storageId: convertedCoverStorageId,
          });
          
          setUploadState({
            status: "uploading",
            progress: 0.95,
          });
        } catch (thumbnailError) {
          console.warn("Failed to generate thumbnail:", thumbnailError);
        }

        // Update lesson images with both cover and thumbnail
        const result = await updateLessonImages({
          id: lessonId,
          coverStorageId: convertedCoverStorageId,
          thumbnailStorageId,
        });

        if (!result) {
          throw new Error("Failed to update the lesson with the uploaded image.");
        }

        const nextCoverUrl = result.coverImageUrl ?? null;
        pendingCoverUrlRef.current = nextCoverUrl;
        setCoverImagePreview((previous) => {
          if (previous && previous.startsWith("blob:")) {
            URL.revokeObjectURL(previous);
          }
          return nextCoverUrl;
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!lessonId) {
      toast.error("Invalid lesson ID.");
      return;
    }

    const validation = lessonUpdateSchema.safeParse({
      title: formValues.title,
      titleAr: formValues.titleAr,
      shortReview: "",
      shortReviewAr: "",
      description: formValues.description,
      descriptionAr: formValues.descriptionAr,
      learningObjectives: formValues.learningObjectives,
      learningObjectivesAr: formValues.learningObjectivesAr,
      courseId: formValues.courseId,
      duration: formValues.duration,
      type: "video",
      status: formValues.status,
      videoUrl: formValues.videoUrl,
      body: undefined,
      bodyAr: undefined,
    });

    if (!validation.success) {
      const issue = validation.error.errors[0];
      toast.error(issue?.message ?? "Please check the form and try again.");
      return;
    }

    const {
      title,
      titleAr,
      description,
      descriptionAr,
      learningObjectives,
      learningObjectivesAr,
      courseId,
      duration,
      status,
      videoUrl,
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

      await updateLesson({
        id: lessonId,
        title,
        titleAr,
        shortReview: "",
        shortReviewAr: "",
        description,
        descriptionAr,
        learningObjectives,
        learningObjectivesAr,
        courseId: courseId as Id<"courses">,
        duration,
        type: "video",
        status,
        videoUrl,
        body: undefined,
        bodyAr: undefined,
      });

      toast.success("Lesson updated successfully");
      const savedValues: FormValues = {
        title,
        titleAr,
        description: description ?? "",
        descriptionAr: descriptionAr ?? "",
        learningObjectives: learningObjectives ?? "",
        learningObjectivesAr: learningObjectivesAr ?? "",
        courseId,
        duration:
          duration !== undefined && duration !== null
            ? String(duration)
            : "",
        status,
        videoUrl: videoUrl ?? "",
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

  const handleDeleteLesson = async () => {
    if (!lessonId) {
      toast.error("Invalid lesson ID.");
      return;
    }

    setIsDeleting(true);

    try {
      await deleteLesson({ id: lessonId });
      toast.success("Lesson deleted successfully");
      navigate("/lessons");
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  if (!lessonId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Invalid lesson identifier.
        </p>
      </div>
    );
  }

  if (lesson === undefined || courses === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading lesson…</p>
      </div>
    );
  }

  if (lesson === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-2 text-center">
          <p className="text-lg font-medium">Lesson not found</p>
          <p className="text-sm text-muted-foreground">
            The lesson you&apos;re looking for does not exist or was removed.
          </p>
          <Button variant="cta" onClick={() => navigate("/lessons")}>
            Back to lessons
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
            onClick={() => navigate("/lessons")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Lesson details</h1>
            <p className="text-muted-foreground mt-1">
              Update content, metadata, and status for this lesson.
            </p>
          </div>
        </div>
        <Badge variant={lesson.status === "published" ? "default" : "secondary"}>
          {statusLabels[lesson.status]}
        </Badge>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardContent className="grid gap-6 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title (EN)</Label>
                <Input
                  id="title"
                  value={formValues.title}
                  onChange={(event) =>
                    setFormValues((prev) => ({ ...prev, title: event.target.value }))
                  }
                  required
                  maxLength={128}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="titleAr">Title (AR)</Label>
                <Input
                  id="titleAr"
                  value={formValues.titleAr}
                  onChange={(event) =>
                    setFormValues((prev) => ({ ...prev, titleAr: event.target.value }))
                  }
                  required
                  maxLength={128}
                  dir="rtl"
                  className="text-right"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="courseId">Course</Label>
                <Select
                  value={formValues.courseId}
                  onValueChange={(value) =>
                    setFormValues((prev) => ({ ...prev, courseId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select course" />
                  </SelectTrigger>
                  <SelectContent>
                    {courseList.map((course) => (
                      <SelectItem key={course._id} value={course._id}>
                        {course.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formValues.status}
                  onValueChange={(value: LessonDoc["status"]) =>
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

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                value={formValues.duration}
                onChange={(event) => {
                  const rawValue = event.target.value;
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

            <Separator />

            <div className="grid gap-6 md:grid-cols-2">
              <RichTextarea
                id="description"
                label="Description (EN)"
                value={formValues.description}
                onChange={(nextValue) =>
                  setFormValues((prev) => ({
                    ...prev,
                    description: nextValue,
                  }))
                }
                maxLength={4096}
                rows={5}
                modalTitle="Edit description"
              />
              <RichTextarea
                id="descriptionAr"
                label="Description (AR)"
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
                modalTitle="Edit Arabic description"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <RichTextarea
                id="learningObjectives"
                label="Learning Objectives (EN)"
                value={formValues.learningObjectives}
                onChange={(nextValue) =>
                  setFormValues((prev) => ({
                    ...prev,
                    learningObjectives: nextValue,
                  }))
                }
                maxLength={4096}
                rows={5}
                modalTitle="Edit learning objectives"
              />
              <RichTextarea
                id="learningObjectivesAr"
                label="Learning Objectives (AR)"
                value={formValues.learningObjectivesAr}
                onChange={(nextValue) =>
                  setFormValues((prev) => ({
                    ...prev,
                    learningObjectivesAr: nextValue,
                  }))
                }
                maxLength={4096}
                rows={5}
                dir="rtl"
                textareaClassName="text-right"
                modalTitle="Edit Arabic learning objectives"
              />
            </div>

            <Separator />

            <div className="max-w-2xl">
              <ImageDropzone
                id="coverImage"
                label="Cover Image"
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

            <div className="space-y-2">
              <Label htmlFor="videoUrl">Video URL</Label>
              <Input
                id="videoUrl"
                value={formValues.videoUrl}
                onChange={(event) =>
                  setFormValues((prev) => ({
                    ...prev,
                    videoUrl: event.target.value,
                  }))
                }
                placeholder="https://"
                type="url"
                maxLength={2048}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="secondary"
            className="sm:w-auto"
            onClick={() => navigate("/lessons")}
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
              Delete lesson
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

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lesson?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <span className="font-medium text-foreground">{lesson.title}</span> and
              all of its content for everyone. You can&apos;t undo this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteLesson}
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

export default LessonDetail;

