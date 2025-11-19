import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, Loader2, PlayCircle, Video, ArrowLeft } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type LessonDoc = Doc<"lessons">;

type CourseProgress = {
  completedLessonIds: Id<"lessons">[];
  completedCount: number;
  lastCompletedAt: number | null;
};

const DEFAULT_PROGRESS: CourseProgress = {
  completedLessonIds: [],
  completedCount: 0,
  lastCompletedAt: null,
};

const formatDuration = (minutes: number | undefined | null) => {
  if (minutes === undefined || minutes === null) {
    return "—";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (remainder === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainder} min`;
};

const getVimeoEmbedUrl = (url?: string | null) => {
  if (!url) {
    return null;
  }

  const trimmed = url.trim();
  const match = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);

  if (match) {
    return `https://player.vimeo.com/video/${match[1]}`;
  }

  return trimmed;
};

const renderStructuredText = (value?: string | null) => {
  if (!value || !value.trim()) {
    return <p className="text-sm text-muted-foreground">Content for this section is coming soon.</p>;
  }

  const lines = value.split(/\r?\n/);
  const blocks: Array<JSX.Element> = [];
  let currentList: string[] = [];

  const flushList = () => {
    if (currentList.length === 0) {
      return;
    }

    blocks.push(
      <ul key={`list-${blocks.length}`} className="list-disc space-y-1 pl-5 text-sm leading-6">
        {currentList.map((item, index) => (
          <li key={`item-${index}`}>{item}</li>
        ))}
      </ul>,
    );
    currentList = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    if (trimmed.startsWith("- ")) {
      currentList.push(trimmed.slice(2));
      return;
    }

    flushList();
    blocks.push(
      <p key={`paragraph-${index}`} className="text-sm leading-6 text-muted-foreground">
        {trimmed}
      </p>,
    );
  });

  flushList();

  return <div className="space-y-3">{blocks}</div>;
};

const CoursePreview = () => {
  const { id } = useParams();
  const courseId = id as Id<"courses"> | undefined;
  const navigate = useNavigate();

  const course = useQuery(api.course.getCourse, courseId ? { id: courseId } : undefined);
  const lessons = useQuery(
    api.lesson.listLessons,
    courseId ? { courseId, status: "published" } : undefined,
  );
  const progress = useQuery(
    api.lessonProgress.getCourseProgress,
    courseId ? { courseId } : undefined,
  );
  const setLessonCompletion = useMutation(api.lessonProgress.setLessonCompletion);

  const [activeLessonId, setActiveLessonId] = useState<Id<"lessons"> | null>(null);
  const [isTogglingCompletion, setIsTogglingCompletion] = useState(false);

  const lessonList = useMemo<LessonDoc[]>(() => {
    if (!lessons) {
      return [];
    }

    return [...lessons].sort((a, b) => a.priority - b.priority);
  }, [lessons]);

  useEffect(() => {
    if (lessonList.length === 0) {
      setActiveLessonId(null);
      return;
    }

    if (!activeLessonId || !lessonList.some((lesson) => lesson._id === activeLessonId)) {
      setActiveLessonId(lessonList[0]._id);
    }
  }, [activeLessonId, lessonList]);

  const progressData: CourseProgress = progress ?? DEFAULT_PROGRESS;

  const completedLessonSet = useMemo(() => {
    return new Set(progressData.completedLessonIds.map((lessonId) => lessonId));
  }, [progressData.completedLessonIds]);
  if (!courseId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Invalid course identifier.</p>
      </div>
    );
  }

  if (course === undefined || lessons === undefined || progress === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading course experience…</p>
      </div>
    );
  }

  if (course === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-3 text-center">
          <p className="text-lg font-semibold">Course not found</p>
          <p className="text-sm text-muted-foreground">
            The selected course is unavailable or has been removed.
          </p>
          <Button variant="cta" onClick={() => navigate("/courses/card")}>
            Back to card view
          </Button>
        </div>
      </div>
    );
  }

  const activeLesson =
    (activeLessonId
      ? lessonList.find((lesson) => lesson._id === activeLessonId)
      : lessonList[0]) ?? null;

  const totalLessons = lessonList.length;
  const lessonPosition = activeLesson ? lessonList.findIndex((lesson) => lesson._id === activeLesson._id) + 1 : 0;
  const completionPercent =
    totalLessons > 0 ? Math.round((progressData.completedCount / totalLessons) * 100) : 0;
  const isActiveLessonCompleted =
    !!activeLesson && completedLessonSet.has(activeLesson._id);
  const previousLesson =
    activeLesson && lessonPosition > 1 ? lessonList[lessonPosition - 2] : null;
  const nextLesson =
    activeLesson && lessonPosition < totalLessons ? lessonList[lessonPosition] : null;
  const videoEmbedUrl = activeLesson ? getVimeoEmbedUrl(activeLesson.video_url ?? course.trial_video_url) : null;

  const handleNavigateLesson = (target?: LessonDoc | null) => {
    if (target) {
      setActiveLessonId(target._id);
    }
  };

  const handleToggleCompletion = async () => {
    if (!activeLesson || !courseId) {
      return;
    }

    setIsTogglingCompletion(true);

    try {
      await setLessonCompletion({
        courseId,
        lessonId: activeLesson._id,
        completed: !isActiveLessonCompleted,
      });

      toast.success(
        isActiveLessonCompleted
          ? "Marked as incomplete."
          : "Lesson marked as complete.",
      );
    } catch (error) {
      console.error(error);
      toast.error("Unable to update lesson completion. Please try again.");
    } finally {
      setIsTogglingCompletion(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate("/courses/card")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        Back to card view
      </div>

      <div className="rounded-3xl border border-border/40 bg-card/80 p-6 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">Course progress</p>
            <h1 className="text-3xl font-bold tracking-tight">{course.name}</h1>
            <p className="text-muted-foreground mt-1">
              {activeLesson
                ? `Lesson ${lessonPosition} of ${totalLessons}: ${activeLesson.title}`
                : "Publish lessons to get started."}
            </p>
          </div>
          <Badge variant="secondary" className="text-primary">
            {completionPercent}% complete
          </Badge>
        </div>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {progressData.completedCount} of {totalLessons || 0} lessons completed
            </span>
            <span>{completionPercent}%</span>
          </div>
          <Progress value={completionPercent} className="h-3 rounded-xl bg-muted" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card className="overflow-hidden border-none bg-card/80 shadow-lg">
            <CardContent className="p-0">
              {videoEmbedUrl ? (
                <div className="aspect-video w-full">
                  <iframe
                    src={videoEmbedUrl}
                    title={activeLesson?.title ?? course.name}
                    className="h-full w-full"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-background via-muted to-background text-muted-foreground">
                  <Video className="h-12 w-12" />
                  <p className="text-sm font-medium">No video available</p>
                  {course.trial_video_url && (
                    <span className="text-xs text-muted-foreground">
                      Add a video URL to this lesson to embed it here.
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 rounded-3xl border border-border/60 bg-background/60 p-4 shadow-sm md:grid-cols-3">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center gap-2"
              onClick={() => handleNavigateLesson(previousLesson)}
              disabled={!previousLesson}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous Lesson
            </Button>
            <Button
              type="button"
              variant={isActiveLessonCompleted ? "secondary" : "cta"}
              className="w-full gap-2"
              disabled={!activeLesson || isTogglingCompletion}
              onClick={handleToggleCompletion}
            >
              {isTogglingCompletion ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {isActiveLessonCompleted ? "Completed" : "Mark Complete"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center gap-2"
              onClick={() => handleNavigateLesson(nextLesson)}
              disabled={!nextLesson}
            >
              Next Lesson
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 rounded-full bg-muted/60 p-1">
              <TabsTrigger value="overview" className="rounded-full">
                Overview
              </TabsTrigger>
              <TabsTrigger value="objectives" className="rounded-full">
                Learning Objectives
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <Card className="border-none bg-card/70 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Lesson Overview</CardTitle>
                </CardHeader>
                <CardContent>{renderStructuredText(activeLesson?.description ?? activeLesson?.short_review)}</CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="objectives">
              <Card className="border-none bg-card/70 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Learning Objectives</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderStructuredText(
                    activeLesson?.learning_objectives ??
                      "Highlight key takeaways or action steps for this lesson.",
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <Card className="border border-border/60 bg-card/70 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Course lessons</p>
                  <CardTitle className="text-xl">Lesson playlist</CardTitle>
                </div>
                <Badge variant="outline">
                  {progressData.completedCount}/{totalLessons} done
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {lessonList.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Publish lessons to make this course playable.
                </div>
              ) : (
                lessonList.map((lesson, index) => {
                  const isActive = activeLesson?._id === lesson._id;
                  const isCompleted = completedLessonSet.has(lesson._id);

                  return (
                    <button
                      key={lesson._id}
                      type="button"
                      onClick={() => setActiveLessonId(lesson._id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition hover:border-primary/40",
                        isActive
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border/40 bg-background/60",
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-semibold leading-5">{lesson.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDuration(lesson.duration)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <PlayCircle className="h-3.5 w-3.5" />
                            Lesson {index + 1}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="border border-border/60 bg-card/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">About this course</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>{course.short_description ?? "Add a short description to highlight the course story."}</p>
              <div className="flex flex-wrap gap-4 text-xs uppercase tracking-wide text-muted-foreground/80">
                <span>
                  Lessons: <span className="font-semibold text-foreground">{course.lesson_count}</span>
                </span>
                <span>
                  Duration:{" "}
                  <span className="font-semibold text-foreground">
                    {formatDuration(course.duration)}
                  </span>
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CoursePreview;

