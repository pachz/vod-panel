import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Image as ImageIcon, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";

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

type ImageDropzoneProps = {
  id: string;
  label: string;
  helperText?: string;
  aspectRatioClass: string;
  value: string | null;
  onSelectFile: (file: File) => void;
};

const ImageDropzone = ({
  id,
  label,
  helperText,
  aspectRatioClass,
  value,
  onSelectFile,
}: ImageDropzoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = (files: FileList | null) => {
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
    inputRef.current?.click();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
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

  const [formValues, setFormValues] = useState<FormValues>(initialFormValues);
  const [initialValues, setInitialValues] = useState<FormValues | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [thumbnailImageFile, setThumbnailImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);
  const [thumbnailImagePreview, setThumbnailImagePreview] = useState<string | null>(null);

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
      setCoverImagePreview((previous) => {
        if (previous === nextCoverUrl) {
          return previous;
        }
        if (previous && previous.startsWith("blob:")) {
          URL.revokeObjectURL(previous);
        }
        return nextCoverUrl;
      });
    }

    if (!thumbnailImageFile) {
      const nextThumbnailUrl = course.thumbnail_image_url ?? null;
      setThumbnailImagePreview((previous) => {
        if (previous === nextThumbnailUrl) {
          return previous;
        }
        if (previous && previous.startsWith("blob:")) {
          URL.revokeObjectURL(previous);
        }
        return nextThumbnailUrl;
      });
    }
  }, [
    course,
    coverImageFile,
    coverImagePreview,
    thumbnailImageFile,
    thumbnailImagePreview,
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
      if (thumbnailImagePreview && thumbnailImagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(thumbnailImagePreview);
      }
    };
  }, [thumbnailImagePreview]);

  const hasFormChanges = useMemo(() => {
    if (!initialValues) {
      return false;
    }

    return JSON.stringify(initialValues) !== JSON.stringify(formValues);
  }, [formValues, initialValues]);

  const hasChanges =
    hasFormChanges || coverImageFile !== null || thumbnailImageFile !== null;

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
      setThumbnailImageFile(null);
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
    setCoverImagePreview((previous) => {
      if (previous && previous.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return nextUrl;
    });
  };

  const handleThumbnailImageSelect = (file: File) => {
    const nextUrl = URL.createObjectURL(file);
    setThumbnailImageFile(file);
    setThumbnailImagePreview((previous) => {
      if (previous && previous.startsWith("blob:")) {
        URL.revokeObjectURL(previous);
      }
      return nextUrl;
    });
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
                  onChange={(event) =>
                    setFormValues((prev) => ({
                      ...prev,
                      durationMinutes: event.target.value,
                    }))
                  }
                  inputMode="numeric"
                  pattern="^[0-9]*$"
                  placeholder="e.g., 120"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <ImageDropzone
                id="coverImage"
                label="Cover image"
                helperText="16:9 ratio. Click to browse or drop an image. The center will be cropped automatically."
                aspectRatioClass="aspect-video"
                value={coverImagePreview}
                onSelectFile={handleCoverImageSelect}
              />
              <ImageDropzone
                id="thumbnailImage"
                label="Thumbnail image"
                helperText="3:4 ratio. Click to browse or drop an image. The center will be cropped automatically."
                aspectRatioClass="aspect-[3/4]"
                value={thumbnailImagePreview}
                onSelectFile={handleThumbnailImageSelect}
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
                isSaving || !hasChanges ? "opacity-60" : "opacity-100",
              )}
              disabled={isSaving || !hasChanges}
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
