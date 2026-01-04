import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { CourseProgressCard } from "@/components/CoursePreview/CourseProgressCard";
import { VideoPlayer, getVimeoEmbedUrl } from "@/components/CoursePreview/VideoPlayer";
import { LessonNavigationButtons } from "@/components/CoursePreview/LessonNavigationButtons";
import { LessonTabs } from "@/components/CoursePreview/LessonTabs";
import { LessonPlaylist } from "@/components/CoursePreview/LessonPlaylist";
import { AboutCourseCard } from "@/components/CoursePreview/AboutCourseCard";
import { Paywall } from "@/components/CoursePreview/Paywall";

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
  const activeLessonRef = useRef<HTMLButtonElement>(null);
  const videoSectionRef = useRef<HTMLDivElement>(null);
  const buttonsSectionRef = useRef<HTMLDivElement>(null);

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

    // Extract page from paginated result
    const lessonsArray = lessons.page ?? [];
    return [...lessonsArray].sort((a, b) => a.priority - b.priority);
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
    return (
      <Paywall
        course={course}
        subscription={subscription}
        priceSummary={priceSummary}
        isPriceLoading={isPriceLoading}
        isStartingCheckout={isStartingCheckout}
        onStartSubscription={handleStartSubscription}
        onBackToCourses={() => {
          const currentLang = searchParams.get("lang");
          navigate(`/courses/card${currentLang ? `?lang=${currentLang}` : ""}`);
        }}
        language={language}
        isRTL={isRTL}
        t={t}
        translateInterval={translateInterval}
      />
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

      <CourseProgressCard
        courseName={courseName}
        activeLesson={activeLesson}
        lessonPosition={lessonPosition}
        totalLessons={totalLessons}
        progressData={progressData}
        completionPercent={completionPercent}
        language={language}
        isRTL={isRTL}
        t={t}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6" ref={videoSectionRef}>
          <VideoPlayer
            videoEmbedUrl={videoEmbedUrl}
            activeLesson={activeLesson}
            courseName={courseName}
            courseTrialVideoUrl={course.trial_video_url}
            language={language}
            t={t}
          />

          <div ref={buttonsSectionRef}>
            <LessonNavigationButtons
              previousLesson={previousLesson}
              nextLesson={nextLesson}
              isActiveLessonCompleted={isActiveLessonCompleted}
              isTogglingCompletion={isTogglingCompletion}
              activeLesson={activeLesson}
              onPrevious={() => handleNavigateLesson(previousLesson)}
              onNext={() => handleNavigateLesson(nextLesson)}
              onToggleCompletion={handleToggleCompletion}
              isRTL={isRTL}
              t={t}
            />
          </div>

          <LessonTabs
            activeLesson={activeLesson}
            language={language}
            isRTL={isRTL}
            t={t}
          />
        </div>

        <div className="space-y-4">
          <LessonPlaylist
            lessons={lessonList}
            activeLessonId={activeLessonId}
            completedLessonIds={completedLessonSet}
            progressData={progressData}
            totalLessons={totalLessons}
            language={language}
            isRTL={isRTL}
            t={t}
            formatDuration={formatDuration}
            onLessonClick={(lessonId) => setActiveLessonId(lessonId as Id<"lessons">)}
            buttonsSectionRef={buttonsSectionRef}
            activeLessonRef={activeLessonRef}
          />

          <AboutCourseCard
            course={course}
            courseShortDescription={courseShortDescription}
            isRTL={isRTL}
            t={t}
            formatDuration={formatDuration}
          />
        </div>
      </div>
    </div>
  );
};

export default CoursePreview;

