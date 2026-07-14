import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Language } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn, markdownToPlainText } from "@/lib/utils";

function CelebrationIcon() {
  return (
    <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
      <span className="absolute left-0 top-1 text-xl select-none" aria-hidden>
        🎉
      </span>
      <span className="absolute right-0 top-2 text-base select-none" aria-hidden>
        ✨
      </span>
      <span
        className="absolute bottom-3 left-1 h-2 w-2 rounded-full bg-amber-400/90"
        aria-hidden
      />
      <span
        className="absolute bottom-5 right-2 h-2.5 w-2.5 rounded-full bg-cta/70"
        aria-hidden
      />
      <span
        className="absolute right-5 top-0 h-1.5 w-1.5 rounded-full bg-orange-400/80"
        aria-hidden
      />
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cta shadow-[0_8px_24px_-4px_hsl(var(--cta)/0.45)]">
        <Check className="h-8 w-8 text-white" strokeWidth={2.5} />
      </div>
    </div>
  );
}

const answerControlClassName =
  "mt-0.5 h-5 w-5 shrink-0 border-muted-foreground/40 text-cta data-[state=checked]:border-cta";

const answerOptionCardClassName = (isSelected: boolean) =>
  cn(
    "flex w-full cursor-pointer items-start gap-3 rounded-xl border p-4 text-start transition-colors hover:border-cta/40 hover:bg-cta/5",
    isSelected && "border-cta bg-cta/5 ring-1 ring-cta/25",
  );

export type PersonalTestQuestion = {
  question: {
    _id: Id<"personalTestQuestions">;
    title: string;
    title_ar: string;
    answerType: "single" | "multi";
  };
  answers: Array<{
    _id: Id<"personalTestAnswers">;
    text: string;
    text_ar: string;
  }>;
};

type CompletedResults = {
  durationSeconds: number;
  courses: Array<{
    _id: Id<"courses">;
    name: string;
    name_ar: string;
    thumbnail_image_url?: string;
    short_description?: string;
    short_description_ar?: string;
  }>;
};

export function formatTestDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) {
    return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

type PersonalTestRunnerProps = {
  testId: Id<"personalTests">;
  testName: string;
  testNameAr: string;
  questions: PersonalTestQuestion[];
  isPreview: boolean;
  /** When false, no attempt is started (e.g. intro screen). */
  active: boolean;
  backHref: string;
  backLabel: string;
  headerExtra?: React.ReactNode;
  /** @deprecated Use testCompletedTitle instead */
  resultsSubtitle?: string;
  testCompletedTitle?: string;
  testCompletedSubtitle?: string;
  topRecommendedLabel?: string;
  viewCourseLabel?: string;
  getCourseHref?: (courseId: Id<"courses">) => string;
  chooseOneLabel: string;
  chooseAllLabel: string;
  previousLabel: string;
  nextLabel: string;
  seeResultsLabel: string;
  savingResultsLabel: string;
  noRecommendationsLabel: string;
  completedInLabel: (duration: string) => string;
  restartLabel: string;
  secondaryAction?: { href: string; label: string };
  /** When set, show a single language instead of bilingual content. */
  language?: Language;
  isRTL?: boolean;
  questionProgressLabel?: (current: number, total: number) => string;
  percentCompleteLabel?: (percent: number) => string;
  showQuestionArabic?: boolean;
  showAnswerArabic?: boolean;
  onRestart?: () => void;
};

export function PersonalTestRunner({
  testId,
  testName,
  testNameAr,
  questions,
  isPreview,
  active,
  backHref,
  backLabel,
  headerExtra,
  resultsSubtitle,
  testCompletedTitle,
  testCompletedSubtitle,
  topRecommendedLabel,
  viewCourseLabel = "View Course",
  getCourseHref = (courseId) => `/courses/preview/${courseId}`,
  chooseOneLabel,
  chooseAllLabel,
  previousLabel,
  nextLabel,
  seeResultsLabel,
  savingResultsLabel,
  noRecommendationsLabel,
  completedInLabel,
  restartLabel,
  secondaryAction,
  language,
  isRTL: isRTLProp,
  questionProgressLabel,
  percentCompleteLabel,
  showQuestionArabic = true,
  showAnswerArabic = true,
  onRestart,
}: PersonalTestRunnerProps) {
  const startAttempt = useMutation(api.personalTestAttempts.startPersonalTestAttempt);
  const completeAttempt = useMutation(api.personalTestAttempts.completePersonalTestAttempt);
  const abandonAttempt = useMutation(api.personalTestAttempts.abandonPersonalTestAttempt);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, Id<"personalTestAnswers">[]>
  >({});
  const [showResults, setShowResults] = useState(false);
  const [completedResults, setCompletedResults] = useState<CompletedResults | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const attemptIdRef = useRef<Id<"personalTestAttempts"> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const attemptFinishedRef = useRef(false);
  const isSingleLanguage = language !== undefined;
  const isArabic = language === "ar";
  const isRTL = isRTLProp ?? isArabic;

  const getQuestionTitle = (question: PersonalTestQuestion["question"]) =>
    isSingleLanguage
      ? isArabic
        ? question.title_ar
        : question.title
      : question.title;

  const getQuestionSubtitle = (question: PersonalTestQuestion["question"]) =>
    !isSingleLanguage && showQuestionArabic ? question.title_ar : undefined;

  const getAnswerText = (answer: PersonalTestQuestion["answers"][number]) =>
    isSingleLanguage ? (isArabic ? answer.text_ar : answer.text) : answer.text;

  const getAnswerSubtitle = (answer: PersonalTestQuestion["answers"][number]) =>
    !isSingleLanguage && showAnswerArabic ? answer.text_ar : undefined;

  const getCourseName = (course: CompletedResults["courses"][number]) =>
    isSingleLanguage ? (isArabic ? course.name_ar : course.name) : course.name;

  const getCourseSubtitle = (course: CompletedResults["courses"][number]) =>
    !isSingleLanguage && showAnswerArabic ? course.name_ar : undefined;

  const getCourseDescription = (course: CompletedResults["courses"][number]) => {
    const raw = isSingleLanguage
      ? isArabic
        ? course.short_description_ar ?? course.short_description
        : course.short_description ?? course.short_description_ar
      : course.short_description;
    if (!raw) return undefined;
    return markdownToPlainText(raw);
  };

  const completionTitle = testCompletedTitle ?? resultsSubtitle ?? "You've completed the test!";
  const completionSubtitle =
    testCompletedSubtitle ??
    "Based on your answers, here are the courses that can help you the most.";
  const recommendedSectionTitle = topRecommendedLabel ?? resultsSubtitle ?? "Recommended courses";

  const allSelectedAnswerIds = useMemo(
    () => Object.values(selectedAnswers).flat(),
    [selectedAnswers],
  );

  const previewResults = useQuery(
    api.personalTest.previewPersonalTestResults,
    isPreview && showResults && allSelectedAnswerIds.length > 0
      ? { testId, selectedAnswerIds: allSelectedAnswerIds }
      : "skip",
  );

  const getElapsedSeconds = useCallback(() => {
    if (!startedAtRef.current) {
      return 1;
    }
    return Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000));
  }, []);

  const abandonCurrentAttempt = useCallback(async () => {
    if (isPreview) {
      return;
    }

    const attemptId = attemptIdRef.current;
    if (!attemptId || attemptFinishedRef.current || !startedAtRef.current) {
      return;
    }

    attemptFinishedRef.current = true;
    try {
      await abandonAttempt({
        attemptId,
        durationSeconds: getElapsedSeconds(),
      });
    } catch {
      // Best effort when leaving the test.
    }
  }, [abandonAttempt, getElapsedSeconds, isPreview]);

  const beginAttempt = useCallback(async () => {
    if (isPreview) {
      startedAtRef.current = Date.now();
      attemptFinishedRef.current = false;
      return;
    }

    const result = await startAttempt({ testId, isPreview: false });
    attemptIdRef.current = result.attemptId;
    startedAtRef.current = result.startedAt;
    attemptFinishedRef.current = false;
  }, [isPreview, startAttempt, testId]);

  useEffect(() => {
    if (!active || questions.length === 0) {
      return;
    }

    void beginAttempt().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to start attempt.");
    });

    return () => {
      void abandonCurrentAttempt();
    };
  }, [active, testId, questions.length, beginAttempt, abandonCurrentAttempt]);

  useEffect(() => {
    if (isPreview) {
      if (!showResults || allSelectedAnswerIds.length === 0) {
        return;
      }

      if (previewResults === undefined) {
        setIsFinalizing(true);
        return;
      }

      setIsFinalizing(false);
      setCompletedResults({
        durationSeconds: getElapsedSeconds(),
        courses: previewResults.courses,
      });
      return;
    }

    if (!showResults || attemptFinishedRef.current || !attemptIdRef.current) {
      return;
    }
    if (allSelectedAnswerIds.length === 0) {
      return;
    }

    let cancelled = false;
    setIsFinalizing(true);

    void completeAttempt({
      attemptId: attemptIdRef.current,
      durationSeconds: getElapsedSeconds(),
      selectedAnswerIds: allSelectedAnswerIds,
    })
      .then((result) => {
        if (cancelled) return;
        attemptFinishedRef.current = true;
        setCompletedResults({
          durationSeconds: result.durationSeconds,
          courses: result.courses,
        });
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to save attempt.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsFinalizing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    isPreview,
    showResults,
    allSelectedAnswerIds,
    previewResults,
    completeAttempt,
    getElapsedSeconds,
  ]);

  const currentQuestion = questions[currentIndex];
  const progressPercent =
    questions.length > 0
      ? Math.round(((currentIndex + 1) / questions.length) * 100)
      : 0;

  const toggleAnswer = (
    questionId: Id<"personalTestQuestions">,
    answerId: Id<"personalTestAnswers">,
    answerType: "single" | "multi",
  ) => {
    setSelectedAnswers((prev) => {
      const current = prev[questionId] ?? [];
      if (answerType === "single") {
        return { ...prev, [questionId]: [answerId] };
      }
      if (current.includes(answerId)) {
        return { ...prev, [questionId]: current.filter((id) => id !== answerId) };
      }
      return { ...prev, [questionId]: [...current, answerId] };
    });
  };

  const canProceed = currentQuestion
    ? (selectedAnswers[currentQuestion.question._id]?.length ?? 0) > 0
    : false;

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setShowResults(true);
    }
  };

  const resetRunnerState = () => {
    setCurrentIndex(0);
    setSelectedAnswers({});
    setShowResults(false);
    setCompletedResults(null);
    setIsFinalizing(false);
    attemptIdRef.current = null;
    startedAtRef.current = null;
  };

  const handleRestart = async () => {
    if (!isPreview) {
      await abandonCurrentAttempt();
    }
    resetRunnerState();
    onRestart?.();
    if (!active) {
      return;
    }
    try {
      await beginAttempt();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to restart attempt.");
    }
  };

  if (questions.length === 0) {
    return null;
  }

  return (
    <div
      className="mx-auto max-w-3xl space-y-6"
      dir={isSingleLanguage ? (isRTL ? "rtl" : "ltr") : undefined}
    >
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="ghost"
          size="sm"
          className={cn(isRTL ? "-mr-2" : "-ml-2")}
          asChild
        >
          <Link to={backHref}>
            {isRTL ? (
              <ArrowRight className="ml-2 h-4 w-4" />
            ) : (
              <ArrowLeft className="mr-2 h-4 w-4" />
            )}
            {backLabel}
          </Link>
        </Button>
        {headerExtra}
      </div>

      {!showResults ? (
        <div className="rounded-2xl border bg-card p-8 space-y-6 shadow-sm">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
              <span>
                {questionProgressLabel
                  ? questionProgressLabel(currentIndex + 1, questions.length)
                  : `Question ${currentIndex + 1} of ${questions.length}`}
              </span>
              <span>
                {percentCompleteLabel
                  ? percentCompleteLabel(progressPercent)
                  : `${progressPercent}% Complete`}
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              dir={isRTL ? "rtl" : "ltr"}
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={
                questionProgressLabel
                  ? questionProgressLabel(currentIndex + 1, questions.length)
                  : `Question ${currentIndex + 1} of ${questions.length}`
              }
            >
              <div
                className="h-full rounded-full bg-cta transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-semibold">
              {getQuestionTitle(currentQuestion!.question)}
            </h2>
            {getQuestionSubtitle(currentQuestion!.question) && (
              <p className="text-muted-foreground" dir="rtl">
                {getQuestionSubtitle(currentQuestion!.question)}
              </p>
            )}
            <span className="inline-flex mt-2 rounded-md border px-2 py-0.5 text-xs text-muted-foreground">
              {currentQuestion!.question.answerType === "single"
                ? chooseOneLabel
                : chooseAllLabel}
            </span>
          </div>

          <div className="space-y-3">
            {currentQuestion!.question.answerType === "single" ? (
              <RadioGroup
                value={selectedAnswers[currentQuestion!.question._id]?.[0] ?? ""}
                onValueChange={(value) => {
                  if (!value) return;
                  setSelectedAnswers((prev) => ({
                    ...prev,
                    [currentQuestion!.question._id]: [
                      value as Id<"personalTestAnswers">,
                    ],
                  }));
                }}
                className="gap-3"
              >
                {currentQuestion!.answers.map((answer) => {
                  const isSelected = (
                    selectedAnswers[currentQuestion!.question._id] ?? []
                  ).includes(answer._id);

                  return (
                    <label
                      key={answer._id}
                      htmlFor={`answer-${answer._id}`}
                      className={answerOptionCardClassName(isSelected)}
                    >
                      <RadioGroupItem
                        id={`answer-${answer._id}`}
                        value={answer._id}
                        className={answerControlClassName}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <span className="font-medium">{getAnswerText(answer)}</span>
                        {getAnswerSubtitle(answer) && (
                          <span className="block text-sm text-muted-foreground" dir="rtl">
                            {getAnswerSubtitle(answer)}
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>
            ) : (
              currentQuestion!.answers.map((answer) => {
                const isSelected = (
                  selectedAnswers[currentQuestion!.question._id] ?? []
                ).includes(answer._id);

                return (
                  <label
                    key={answer._id}
                    htmlFor={`answer-${answer._id}`}
                    className={answerOptionCardClassName(isSelected)}
                  >
                    <Checkbox
                      id={`answer-${answer._id}`}
                      checked={isSelected}
                      onCheckedChange={() =>
                        toggleAnswer(
                          currentQuestion!.question._id,
                          answer._id,
                          currentQuestion!.question.answerType,
                        )
                      }
                      className={cn(
                        answerControlClassName,
                        "rounded-[5px] data-[state=checked]:bg-cta data-[state=checked]:text-white",
                      )}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <span className="font-medium">{getAnswerText(answer)}</span>
                      {getAnswerSubtitle(answer) && (
                        <span className="block text-sm text-muted-foreground" dir="rtl">
                          {getAnswerSubtitle(answer)}
                        </span>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>

          <div className="flex justify-between gap-3 pt-2">
            {isRTL ? (
              <>
                <Button variant="cta" onClick={handleNext} disabled={!canProceed}>
                  {currentIndex === questions.length - 1 ? seeResultsLabel : nextLabel}
                  <ChevronLeft className="ms-2 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                >
                  <ChevronRight className="me-2 h-4 w-4" />
                  {previousLabel}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                >
                  <ChevronLeft className="me-2 h-4 w-4" />
                  {previousLabel}
                </Button>
                <Button variant="cta" onClick={handleNext} disabled={!canProceed}>
                  {currentIndex === questions.length - 1 ? seeResultsLabel : nextLabel}
                  <ChevronRight className="ms-2 h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="space-y-3 text-center">
            <CelebrationIcon />
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {completionTitle}
            </h2>
            <p className="mx-auto max-w-lg text-muted-foreground">{completionSubtitle}</p>
            {completedResults && (
              <p className="text-sm text-muted-foreground">
                {completedInLabel(formatTestDuration(completedResults.durationSeconds))}
              </p>
            )}
          </div>

          {isFinalizing || completedResults === null ? (
            <p className="text-center text-muted-foreground">{savingResultsLabel}</p>
          ) : completedResults.courses.length === 0 ? (
            <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
              <p className="text-muted-foreground">{noRecommendationsLabel}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">{recommendedSectionTitle}</h3>
              <ul className="space-y-4">
                {completedResults.courses.map((course) => (
                  <li
                    key={course._id}
                    className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center"
                  >
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-24 sm:w-24">
                      {course.thumbnail_image_url ? (
                        <img
                          src={course.thumbnail_image_url}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                          —
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1 text-start">
                      <p className="font-semibold leading-snug">{getCourseName(course)}</p>
                      {getCourseDescription(course) && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {getCourseDescription(course)}
                        </p>
                      )}
                      {getCourseSubtitle(course) && (
                        <p className="text-sm text-muted-foreground" dir="rtl">
                          {getCourseSubtitle(course)}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      className="shrink-0 border-cta text-cta hover:bg-cta/5 hover:text-cta"
                      asChild
                    >
                      <a
                        href={getCourseHref(course._id)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {viewCourseLabel}
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col items-center gap-3 pt-2">
            {secondaryAction && (
              <Button variant="cta" className="w-full max-w-md" asChild>
                <Link to={secondaryAction.href}>
                  {secondaryAction.label}
                  <ArrowRight
                    className={cn("h-4 w-4", isRTL ? "me-2 rotate-180" : "ms-2")}
                  />
                </Link>
              </Button>
            )}
            <Button variant="ghost" onClick={() => void handleRestart()}>
              {restartLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
