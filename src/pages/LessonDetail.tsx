import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
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
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { RichTextarea } from "@/components/RichTextarea";
import { CourseCombobox } from "@/components/CourseCombobox";
import { VideoUrlInput } from "@/components/VideoUrlInput";
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
  chapterId: string;
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
  chapterId: "",
  status: "draft",
  videoUrl: "",
};


const statusLabels: Record<LessonDoc["status"], string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

/** Duration is stored in seconds; format as time for form display (0:10 or 01:10:10). */
const formatDurationTime = (seconds: number | undefined | null) => {
  if (seconds === undefined || seconds === null) {
    return "—";
  }
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${m}:${pad(s)}`;
};

const LessonDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const lessonId = id as Id<"lessons"> | undefined;

  const [formValues, setFormValues] = useState<FormValues>(initialFormValues);

  const lesson = useQuery(
    api.lesson.getLesson,
    lessonId ? { id: lessonId } : undefined,
  );
  const courses = useQuery(api.course.listCourses, {});
  const defaultChapterForSelectedCourse = useQuery(
    api.course.getDefaultChapterForCourse,
    formValues.courseId ? { courseId: formValues.courseId as Id<"courses"> } : "skip",
  );
  const chapters = useQuery(
    api.chapter.listChaptersByCourse,
    formValues.courseId ? { courseId: formValues.courseId as Id<"courses"> } : "skip",
  );

  const updateLesson = useMutation(api.lesson.updateLesson);
  const validateVideoUrl = useAction(api.image.validateVideoUrl);
  const deleteLesson = useMutation(api.lesson.deleteLesson);
  const [initialValues, setInitialValues] = useState<FormValues | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [videoUrlServerError, setVideoUrlServerError] = useState<string | null>(null);

  const courseList = useMemo<CourseDoc[]>(() => {
    if (!courses) return [];
    // Extract page from paginated result
    return courses.page ?? [];
  }, [courses]);
  const isLoading = lesson === undefined || courses === undefined;

  // When user changes course, preselect default chapter if we have it
  useEffect(() => {
    if (
      formValues.courseId &&
      !formValues.chapterId &&
      defaultChapterForSelectedCourse
    ) {
      setFormValues((prev) => ({
        ...prev,
        chapterId: defaultChapterForSelectedCourse,
      }));
    }
  }, [formValues.courseId, formValues.chapterId, defaultChapterForSelectedCourse]);

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
      chapterId: lesson.chapter_id ?? "",
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

  const hasFormChanges = useMemo(() => {
    if (!initialValues) {
      return false;
    }

    return JSON.stringify(initialValues) !== JSON.stringify(formValues);
  }, [formValues, initialValues]);

  const hasChanges = hasFormChanges;

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


  const handleVideoUrlChange = (value: string) => {
    setVideoUrlServerError(null);
    setFormValues((prev) => ({
      ...prev,
      videoUrl: value,
    }));
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
      chapterId: formValues.chapterId,
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
      chapterId,
      status,
      videoUrl,
    } = validation.data;

    const trimmedVideoUrl = videoUrl?.trim();
    const shouldValidateVideoUrl = Boolean(trimmedVideoUrl);

    if (shouldValidateVideoUrl && trimmedVideoUrl) {
      setIsSaving(true);

      try {
        await validateVideoUrl({ videoUrl: trimmedVideoUrl });
        setVideoUrlServerError(null);
      } catch (validationError) {
        const message = getErrorMessage(validationError);
        setVideoUrlServerError(message);
        toast.error(message);
        setIsSaving(false);
        return;
      }
    } else {
      setIsSaving(true);
    }

    try {
      const result = await updateLesson({
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
        chapterId: chapterId as Id<"chapters">,
        type: "video",
        status,
        videoUrl,
        body: undefined,
        bodyAr: undefined,
      });

      toast.success("Lesson updated successfully");
      if (result?.courseRevertedToDraft) {
        toast.warning(
          `"${result.courseRevertedToDraft.courseName}" was set back to Draft because all its lessons are now in Draft.`,
          { duration: 6000 }
        );
      }
      const savedValues: FormValues = {
        title,
        titleAr,
        description: description ?? "",
        descriptionAr: descriptionAr ?? "",
        learningObjectives: learningObjectives ?? "",
        learningObjectivesAr: learningObjectivesAr ?? "",
        courseId,
        chapterId,
        status,
        videoUrl: videoUrl ?? "",
      };
      setInitialValues(savedValues);
      setFormValues(savedValues);
      setVideoUrlServerError(null);
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
          {lesson.thumbnail_image_url && (
            <div className="w-20 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              <img
                src={lesson.thumbnail_image_url}
                alt={lesson.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Lesson details</h1>
            <p className="text-muted-foreground mt-1">
              Update content, metadata, and status for this lesson.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          {lesson.course_id ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/courses/${lesson.course_id}`)}
            >
              Back to Course
            </Button>
          ) : null}
          <Badge variant={lesson.status === "published" ? "default" : "secondary"}>
            {statusLabels[lesson.status]}
          </Badge>
        </div>
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
                <CourseCombobox
                  courses={courseList}
                  value={formValues.courseId}
                  onValueChange={(value) => {
                    setFormValues((prev) => {
                      const next = { ...prev, courseId: value };
                      const course = value ? courseList.find((c) => c._id === value) : null;
                      next.chapterId = course?.default_chapter_id ?? "";
                      return next;
                    });
                  }}
                  placeholder="Select course"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="chapterId">Chapter (required)</Label>
                <Select
                  value={formValues.chapterId}
                  onValueChange={(value) =>
                    setFormValues((prev) => ({ ...prev, chapterId: value }))
                  }
                  required
                  disabled={!formValues.courseId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select chapter" />
                  </SelectTrigger>
                  <SelectContent>
                    {(chapters ?? []).map((ch) => (
                      <SelectItem key={ch._id} value={ch._id}>
                        {ch.title} / {ch.title_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Each lesson must belong to a chapter.
                </p>
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
              <div className="space-y-2">
                <Label htmlFor="duration">Duration</Label>
                <Input
                  id="duration"
                  value={lesson ? formatDurationTime(lesson.duration) : "—"}
                  disabled
                  className="bg-muted"
                  aria-describedby="duration-hint"
                />
                <p id="duration-hint" className="text-xs text-muted-foreground">
                  Fetched from Vimeo when you save a video URL.
                </p>
              </div>
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

            <VideoUrlInput
              id="videoUrl"
              value={formValues.videoUrl}
              onChange={handleVideoUrlChange}
              externalError={videoUrlServerError}
              placeholder="https://vimeo.com/..."
              maxLength={2048}
            />
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
                isSaving || !hasChanges
                  ? "opacity-60"
                  : "opacity-100",
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

