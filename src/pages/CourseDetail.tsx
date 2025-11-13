import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Image as ImageIcon, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  instructor: string;
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
  instructor: "",
};

const statusLabels: Record<CourseDoc["status"], string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
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
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const categoryList = useMemo<CategoryDoc[]>(() => categories ?? [], [categories]);
  const isLoading = course === undefined || categories === undefined;

  useEffect(() => {
    if (!courseId || !course) {
      return;
    }

    setFormValues({
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
      instructor: course.instructor ?? "",
    });
  }, [course, courseId]);

  useEffect(() => {
    if (!isLoading && isDeleteDialogOpen) {
      setIsDeleteDialogOpen(false);
    }
  }, [isLoading, isDeleteDialogOpen]);

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
      instructor: formValues.instructor,
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
        instructor,
      });

      toast.success("Course updated successfully");
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
              <div className="space-y-2">
                <Label htmlFor="shortDescription">Short description</Label>
                <Textarea
                  id="shortDescription"
                  value={formValues.shortDescription}
                  onChange={(event) =>
                    setFormValues((prev) => ({
                      ...prev,
                      shortDescription: event.target.value,
                    }))
                  }
                  required
                  maxLength={512}
                  rows={3}
                  className="resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shortDescriptionAr">Arabic short description</Label>
                <Textarea
                  id="shortDescriptionAr"
                  value={formValues.shortDescriptionAr}
                  onChange={(event) =>
                    setFormValues((prev) => ({
                      ...prev,
                      shortDescriptionAr: event.target.value,
                    }))
                  }
                  required
                  maxLength={512}
                  dir="rtl"
                  rows={3}
                  className="resize-none text-right"
                />
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="description">Full description</Label>
                <Textarea
                  id="description"
                  value={formValues.description}
                  onChange={(event) =>
                    setFormValues((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  maxLength={4096}
                  rows={5}
                  className="resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="descriptionAr">Arabic full description</Label>
                <Textarea
                  id="descriptionAr"
                  value={formValues.descriptionAr}
                  onChange={(event) =>
                    setFormValues((prev) => ({
                      ...prev,
                      descriptionAr: event.target.value,
                    }))
                  }
                  maxLength={4096}
                  dir="rtl"
                  rows={5}
                  className="resize-none text-right"
                />
              </div>
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

            <div className="space-y-2">
              <Label htmlFor="instructor">Instructor</Label>
              <Input
                id="instructor"
                value={formValues.instructor}
                onChange={(event) =>
                  setFormValues((prev) => ({
                    ...prev,
                    instructor: event.target.value,
                  }))
                }
                maxLength={128}
              />
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <div className="space-y-3">
                <Label>Cover image</Label>
                <div className="relative flex aspect-video items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30">
                  {course.banner_image_url ? (
                    <img
                      src={course.banner_image_url}
                      alt="Course cover"
                      className="h-full w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="mx-auto mb-2 h-12 w-12" />
                      <p className="text-sm font-medium">Cover image coming soon</p>
                      <p className="text-xs">
                        You&apos;ll be able to upload an image here later.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                <Label>Thumbnail image</Label>
                <div className="relative flex aspect-[3/4] items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30">
                  {course.thumbnail_image_url ? (
                    <img
                      src={course.thumbnail_image_url}
                      alt="Course thumbnail"
                      className="h-full w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="mx-auto mb-2 h-10 w-10" />
                      <p className="text-sm font-medium">Thumbnail coming soon</p>
                      <p className="text-xs">
                        You&apos;ll be able to upload a portrait image here later.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="sm:w-auto"
            onClick={() => navigate("/courses")}
          >
            Cancel
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
              className="w-full sm:w-auto"
              disabled={isSaving}
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
