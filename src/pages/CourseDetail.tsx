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
import { courseUpdateSchema } from "../../shared/validation/course";

type CourseDoc = Doc<"courses">;
type CategoryDoc = Doc<"categories">;

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
  durationMinutes: string;
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
  durationMinutes: "",
};

const statusLabels: Record<CourseDoc["status"], string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
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

const CourseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const courseId = id as Id<"courses"> | undefined;

  const course = useQuery(
    api.course.getCourse,
    courseId ? { id: courseId } : undefined,
  );
  const categories = useQuery(api.category.listCategories);

  const updateCourse = useMutation(api.course.updateCourse);
  const deleteCourse = useMutation(api.course.deleteCourse);
  const generateImageUploadUrl = useMutation(api.course.generateImageUploadUrl);
  const updateCourseImages = useMutation(api.course.updateCourseImages);
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

  const categoryList = useMemo<CategoryDoc[]>(() => categories ?? [], [categories]);
  const isLoading = course === undefined || categories === undefined;

  useEffect(() => {
    if (!courseId || !course) {
      return;
    }

    const nextValues: FormValues = {
      name: course.name,
      nameAr: course.name_ar,
      shortDescription: course.short_description,
      shortDescriptionAr: course.short_description_ar,
      description: course.description ?? "",
      descriptionAr: course.description_ar ?? "",
      categoryId: course.category_id,
      status: course.status,
      trialVideoUrl: course.trial_video_url ?? "",
      durationMinutes:
        course.duration !== undefined && course.duration !== null
          ? String(course.duration)
          : "",
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
  }, [course, courseId]);

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
      durationMinutes: formValues.durationMinutes,
    });

    if (!validation.success) {
      const issue = validation.error.errors[0];
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
      durationMinutes,
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
        durationMinutes,
      });

      toast.success("Course updated successfully");
      const savedValues: FormValues = {
        name,
        nameAr,
        shortDescription,
        shortDescriptionAr,
        description: description ?? "",
        descriptionAr: descriptionAr ?? "",
        categoryId,
        status,
        trialVideoUrl: trialVideoUrl ?? "",
        durationMinutes:
          durationMinutes !== undefined && durationMinutes !== null
            ? String(durationMinutes)
            : "",
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

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardContent className="grid gap-6 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
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
                <Label htmlFor="nameAr">Arabic name</Label>
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
                label="Short description"
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
                label="Arabic short description"
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
                modalTitle="Edit Arabic short description"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <RichTextarea
                id="description"
                label="Full description"
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
                label="Arabic full description"
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
                modalTitle="Edit Arabic full description"
              />
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="trialVideoUrl">Trial video URL</Label>
                <Input
                  id="trialVideoUrl"
                  value={formValues.trialVideoUrl}
                  onChange={(event) =>
                    setFormValues((prev) => ({
                      ...prev,
                      trialVideoUrl: event.target.value,
                    }))
                  }
                  placeholder="https://"
                  type="url"
                  maxLength={2048}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="durationMinutes">Duration (minutes)</Label>
                <Input
                  id="durationMinutes"
                  value={formValues.durationMinutes}
                  onChange={(event) => {
                    const rawValue = event.target.value;
                    const sanitizedValue = rawValue.replace(/\D/g, "");
                    setFormValues((prev) => ({
                      ...prev,
                      durationMinutes: sanitizedValue,
                    }));
                  }}
                  inputMode="numeric"
                  pattern="^[0-9]*$"
                  placeholder="e.g., 120"
                />
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
