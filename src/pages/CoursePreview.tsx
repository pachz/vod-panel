import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Loader2,
  PlayCircle,
  Video,
  ArrowLeft,
  Lock,
  CreditCard,
} from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

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

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

const formatDuration = (minutes: number | undefined | null, t: (key: string) => string) => {
  if (minutes === undefined || minutes === null) {
    return "—";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (remainder === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
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

const renderMarkdown = (value?: string | null, isRTL: boolean = false) => {
  if (!value || !value.trim()) {
    return <p className="text-sm text-muted-foreground">Content for this section is coming soon.</p>;
  }

  return (
    <div className={cn("prose prose-sm max-w-none dark:prose-invert", isRTL && "prose-rtl")} dir={isRTL ? "rtl" : "ltr"}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="text-sm leading-6 text-muted-foreground mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 mb-3 last:mb-0 text-sm leading-6 text-muted-foreground">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 mb-3 last:mb-0 text-sm leading-6 text-muted-foreground">{children}</ol>,
          li: ({ children }) => <li className="text-sm leading-6 text-muted-foreground">{children}</li>,
          h1: ({ children }) => <h1 className="text-2xl font-bold mb-3 mt-4 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-semibold mb-2 mt-3 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-semibold mb-2 mt-3 first:mt-0">{children}</h3>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
          blockquote: ({ children }) => <blockquote className="border-l-4 border-primary pl-4 italic my-3">{children}</blockquote>,
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
};

const CoursePreview = () => {
  const { id } = useParams();
  const courseId = id as Id<"courses"> | undefined;
  const navigate = useNavigate();
  const { language, t, translateInterval, isRTL } = useLanguage();

  const course = useQuery(api.course.getCourse, courseId ? { id: courseId } : undefined);
  const currentUser = useQuery(api.user.getCurrentUser);
  const subscription = useQuery(api.paymentInternal.getMySubscription);
  const paymentSettings = useQuery(api.paymentInternal.getPaymentSettingsPublic);
  const createCheckoutSession = useAction(api.payment.createCheckoutSession);
  const isAdmin = currentUser?.isGod ?? false;
  const hasActiveSubscription = subscription ? ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) : false;
  const canAccessProtectedContent = isAdmin || hasActiveSubscription;
  const lessons = useQuery(
    api.lesson.listLessons,
    courseId && canAccessProtectedContent ? { courseId, status: "published" } : undefined,
  );
  const progress = useQuery(
    api.lessonProgress.getCourseProgress,
    courseId && canAccessProtectedContent ? { courseId } : undefined,
  );
  const setLessonCompletion = useMutation(api.lessonProgress.setLessonCompletion);

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeLessonId, setActiveLessonId] = useState<Id<"lessons"> | null>(null);
  const [isTogglingCompletion, setIsTogglingCompletion] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  const priceSummary = useMemo(() => {
    if (!paymentSettings) {
      return null;
    }

    return {
      amount: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: paymentSettings.priceCurrency.toUpperCase(),
      }).format(paymentSettings.priceAmount / 100),
      interval: paymentSettings.priceInterval,
      productName: paymentSettings.productName,
    };
  }, [paymentSettings]);

  const isPriceLoading = paymentSettings === undefined;

  const lessonList = useMemo<LessonDoc[]>(() => {
    if (!lessons) {
      return [];
    }

    return [...lessons].sort((a, b) => a.priority - b.priority);
  }, [lessons]);

  const searchLessonId = searchParams.get("lesson");
  const queryLessonId = (searchLessonId as Id<"lessons"> | null) ?? null;

  useEffect(() => {
    if (lessonList.length === 0) {
      setActiveLessonId(null);
      return;
    }

    if (queryLessonId && lessonList.some((lesson) => lesson._id === queryLessonId)) {
      setActiveLessonId((prev) => {
        if (prev === queryLessonId) {
          return prev;
        }
        return queryLessonId;
      });
      return;
    }

    setActiveLessonId((prev) => {
      if (!prev || !lessonList.some((lesson) => lesson._id === prev)) {
        return lessonList[0]._id;
      }
      return prev;
    });
  }, [lessonList, queryLessonId]);

  useEffect(() => {
    if (lessonList.length === 0) {
      return;
    }

    if (!activeLessonId) {
      if (searchLessonId) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("lesson");
        setSearchParams(nextParams, { replace: true });
      }
      return;
    }

    if (searchLessonId === activeLessonId) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("lesson", activeLessonId);
    setSearchParams(nextParams, { replace: true });
  }, [activeLessonId, lessonList.length, searchLessonId, searchParams, setSearchParams]);

  const progressData: CourseProgress = progress ?? DEFAULT_PROGRESS;

  const completedLessonSet = useMemo(() => {
    return new Set(progressData.completedLessonIds.map((lessonId) => lessonId));
  }, [progressData.completedLessonIds]);
  if (!courseId) {
    return (
      <div className="flex h-full items-center justify-center" dir={isRTL ? "rtl" : "ltr"}>
        <p className="text-muted-foreground">{t("invalidCourseId")}</p>
      </div>
    );
  }

  if (course === undefined) {
    return (
      <div className="flex h-full items-center justify-center" dir={isRTL ? "rtl" : "ltr"}>
        <p className="text-muted-foreground">{t("loadingCourse")}</p>
      </div>
    );
  }

  if (!isAdmin && subscription === undefined) {
    return (
      <div className="flex h-full items-center justify-center" dir={isRTL ? "rtl" : "ltr"}>
        <p className="text-muted-foreground">{t("checkingSubscription")}</p>
      </div>
    );
  }

  if (course === null) {
    return (
      <div className="flex h-full items-center justify-center" dir={isRTL ? "rtl" : "ltr"}>
        <div className="space-y-3 text-center">
          <p className="text-lg font-semibold">{t("courseNotFound")}</p>
          <p className="text-sm text-muted-foreground">
            {t("courseUnavailable")}
          </p>
          <Button variant="cta" onClick={() => {
            const currentLang = searchParams.get("lang");
            navigate(`/courses/card${currentLang ? `?lang=${currentLang}` : ""}`);
          }}>
            {t("backToCourseListButton")}
          </Button>
        </div>
      </div>
    );
  }

  const handleStartSubscription = async () => {
    setIsStartingCheckout(true);

    try {
      const checkoutUrl = await createCheckoutSession();
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }

      toast.error("Unable to start the subscription checkout. Please try again.");
    } catch (error) {
      console.error(error);
      toast.error("Unable to start the subscription checkout. Please try again.");
    } finally {
      setIsStartingCheckout(false);
    }
  };

  if (!canAccessProtectedContent) {
    const courseImageUrl = course.thumbnail_image_url ?? course.banner_image_url ?? "/RehamDivaLogo.png";
    const courseName = language === "ar" ? course.name_ar : course.name;
    const courseDescription = language === "ar" 
      ? (course.short_description_ar ?? course.description_ar ?? course.short_description ?? course.description ?? t("unlockFullProgram"))
      : (course.short_description ?? course.description ?? t("unlockFullProgram"));

    return (
      <div className="flex h-full items-center justify-center p-4 md:p-10" dir={isRTL ? "rtl" : "ltr"}>
        <div className="w-full max-w-5xl space-y-6">
          <Card className="w-full overflow-hidden border border-border/40 dark:border-transparent bg-card/95 shadow-2xl">
            <div className="grid gap-0 lg:grid-cols-2">
              <div className="relative h-64 w-full lg:h-full">
                {courseImageUrl ? (
                  <img src={courseImageUrl} alt={`Preview of ${courseName}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-background via-muted to-background text-muted-foreground">
                    <Video className="h-10 w-10" />
                    <span className="text-sm font-medium">{t("premiumCourse")}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 space-y-1 text-white">
                  <p className="text-xs uppercase tracking-[0.35em] text-white/70">{t("premiumCourse")}</p>
                  <p className="text-2xl font-semibold leading-snug">{courseName}</p>
                  <p className="text-sm text-white/80 line-clamp-2">
                    {courseDescription}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-6 p-6 md:p-10">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Lock className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("membershipRequired")}</p>
                      <CardTitle className="text-3xl">{t("unlock")} {courseName}</CardTitle>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {subscription
                      ? `${t("subscriptionStatus")} ${subscription.status}. ${t("activateSubscription")}`
                      : t("activeSubscriptionDescription")}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("yourInvestment")}</p>
                  {isPriceLoading ? (
                    <div className="h-10 w-40 animate-pulse rounded-xl bg-muted" />
                  ) : priceSummary ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-foreground">{priceSummary.amount}</span>
                      <span className="text-sm text-muted-foreground">{t("per")} {translateInterval(priceSummary.interval)}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("subscriptionPricing")}
                    </p>
                  )}
                  {priceSummary?.productName && (
                    <p className="text-xs text-muted-foreground/80">{t("plan")}: {priceSummary.productName}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <Button variant="cta" className="w-full justify-center gap-2 text-base" onClick={handleStartSubscription} disabled={isStartingCheckout}>
                    {isStartingCheckout ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4" />
                    )}
                    {t("subscribeUnlock")}
                  </Button>
                  <Button variant="ghost" className="w-full justify-center text-muted-foreground" onClick={() => {
                    const currentLang = searchParams.get("lang");
                    navigate(`/courses/card${currentLang ? `?lang=${currentLang}` : ""}`);
                  }}>
                    {t("backToCourses")}
                  </Button>
                </div>

                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    {t("unlimitedStreaming")}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    {t("progressTracking")}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    {t("bonusResources")}
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (lessons === undefined || progress === undefined) {
    return (
      <div className="flex h-full items-center justify-center" dir={isRTL ? "rtl" : "ltr"}>
        <p className="text-muted-foreground">{t("loadingCourse")}</p>
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

  const courseName = language === "ar" ? course.name_ar : course.name;
  const courseShortDescription = language === "ar" 
    ? (course.short_description_ar ?? course.short_description ?? t("addShortDescription"))
    : (course.short_description ?? t("addShortDescription"));

  return (
    <div className="mx-auto max-w-6xl space-y-8" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => {
          const currentLang = searchParams.get("lang");
          navigate(`/courses/card${currentLang ? `?lang=${currentLang}` : ""}`);
        }}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {t("backToCourseList")}
      </div>

      <div className="rounded-3xl border border-border/40 dark:border-transparent bg-card/80 p-6 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-primary">{t("courseProgress")}</p>
            <h1 className="text-3xl font-bold tracking-tight">{courseName}</h1>
            <p className="text-muted-foreground mt-1 line-clamp-2">
              {activeLesson
                ? `${t("lessonOf")} ${lessonPosition} ${t("of")} ${totalLessons}: ${language === "ar" ? activeLesson.title_ar : activeLesson.title}`
                : t("publishLessonsToStart")}
            </p>
          </div>
          <Badge variant="secondary" className="text-primary flex-shrink-0">
            {completionPercent}% {t("complete")}
          </Badge>
        </div>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {progressData.completedCount} {t("of")} {totalLessons || 0} {t("lessonsCompleted")}
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
                    title={activeLesson ? (language === "ar" ? activeLesson.title_ar : activeLesson.title) : courseName}
                    className="h-full w-full"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-background via-muted to-background text-muted-foreground">
                  <Video className="h-12 w-12" />
                  <p className="text-sm font-medium">{t("noVideoAvailable")}</p>
                  {course.trial_video_url && (
                    <span className="text-xs text-muted-foreground">
                      {t("addVideoUrl")}
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 rounded-3xl border border-border/60 dark:border-transparent bg-background/60 p-4 shadow-sm md:grid-cols-3">
            {isRTL ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center gap-2"
                  onClick={() => handleNavigateLesson(nextLesson)}
                  disabled={!nextLesson}
                >
                  {t("nextLesson")}
                  <ChevronLeft className="h-4 w-4" />
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
                  {isActiveLessonCompleted ? t("completed") : t("markComplete")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center gap-2"
                  onClick={() => handleNavigateLesson(previousLesson)}
                  disabled={!previousLesson}
                >
                  <ChevronRight className="h-4 w-4" />
                  {t("previousLesson")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center gap-2"
                  onClick={() => handleNavigateLesson(previousLesson)}
                  disabled={!previousLesson}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t("previousLesson")}
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
                  {isActiveLessonCompleted ? t("completed") : t("markComplete")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center gap-2"
                  onClick={() => handleNavigateLesson(nextLesson)}
                  disabled={!nextLesson}
                >
                  {t("nextLesson")}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 rounded-full bg-muted/60 p-1">
              <TabsTrigger value="overview" className="rounded-full">
                {t("overview")}
              </TabsTrigger>
              <TabsTrigger value="objectives" className="rounded-full">
                {t("learningObjectives")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <Card className="border-none bg-card/70 shadow-sm">
                <CardHeader>
                  <CardTitle className={cn("text-lg font-semibold", isRTL ? "text-right" : "text-left")}>{t("lessonOverview")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderMarkdown(
                    activeLesson 
                      ? (language === "ar" 
                          ? (activeLesson.description_ar ?? activeLesson.short_review_ar ?? activeLesson.description ?? activeLesson.short_review)
                          : (activeLesson.description ?? activeLesson.short_review))
                      : undefined,
                    isRTL
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="objectives">
              <Card className="border-none bg-card/70 shadow-sm">
                <CardHeader>
                  <CardTitle className={cn("text-lg font-semibold", isRTL ? "text-right" : "text-left")}>{t("learningObjectives")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderMarkdown(
                    activeLesson
                      ? (language === "ar"
                          ? (activeLesson.learning_objectives_ar ?? activeLesson.learning_objectives)
                          : activeLesson.learning_objectives)
                      : undefined,
                    isRTL
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <Card className="border border-border/60 dark:border-transparent bg-card/70 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <p className={cn("text-sm font-semibold text-muted-foreground", isRTL ? "text-right" : "text-left")}>{t("courseLessons")}</p>
                  <CardTitle className={cn("text-xl", isRTL ? "text-right" : "text-left")}>{t("lessonPlaylist")}</CardTitle>
                </div>
                <Badge variant="outline">
                  {progressData.completedCount}/{totalLessons} {t("done")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {lessonList.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {t("publishLessons")}
                </div>
              ) : (
                lessonList.map((lesson, index) => {
                  const isActive = activeLesson?._id === lesson._id;
                  const isCompleted = completedLessonSet.has(lesson._id);
                  const lessonTitle = language === "ar" ? lesson.title_ar : lesson.title;

                  return (
                    <button
                      key={lesson._id}
                      type="button"
                      onClick={() => setActiveLessonId(lesson._id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition hover:border-primary/40",
                        isActive
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border/40 dark:border-transparent bg-background/60",
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-semibold leading-5">{lessonTitle}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDuration(lesson.duration, t)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <PlayCircle className="h-3.5 w-3.5" />
                            {t("lessonOf")} {index + 1}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="border border-border/60 dark:border-transparent bg-card/70 shadow-sm">
            <CardHeader>
              <CardTitle className={cn("text-lg font-semibold", isRTL ? "text-right" : "text-left")}>{t("aboutThisCourse")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {renderMarkdown(courseShortDescription, isRTL)}
              <div className="flex flex-wrap gap-4 text-xs uppercase tracking-wide text-muted-foreground/80">
                <span>
                  {t("lessons")}: <span className="font-semibold text-foreground">{course.lesson_count}</span>
                </span>
                <span>
                  {t("duration")}:{" "}
                  <span className="font-semibold text-foreground">
                    {formatDuration(course.duration, t)}
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

