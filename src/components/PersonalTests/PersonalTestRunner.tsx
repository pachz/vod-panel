import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "convex/react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Language } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  resultsSubtitle: string;
  chooseOneLabel: string;
  chooseAllLabel: string;
  previousLabel: string;
  nextLabel: string;
  seeResultsLabel: string;
  savingResultsLabel: string;
  noRecommendationsLabel: string;
  completedInLabel: (duration: string, seconds: number) => string;
  restartLabel: string;
  secondaryAction?: { href: string; label: string };
  /** When set, show a single language instead of bilingual content. */
  language?: Language;
  questionProgressLabel?: (current: number, total: number) => string;
  basedOnAnswersLabel?: (testName: string) => string;
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
  questionProgressLabel,
  basedOnAnswersLabel,
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

  const displayTestName = isSingleLanguage
    ? isArabic
      ? testNameAr
      : testName
    : testName;
  const displayTestNameSecondary =
    !isSingleLanguage && showQuestionArabic ? testNameAr : undefined;

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

  const allSelectedAnswerIds = useMemo(
    () => Object.values(selectedAnswers).flat(),
    [selectedAnswers],
  );

  const getElapsedSeconds = useCallback(() => {
    if (!startedAtRef.current) {
      return 1;
    }
    return Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000));
  }, []);

  const abandonCurrentAttempt = useCallback(async () => {
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
  }, [abandonAttempt, getElapsedSeconds]);

  const beginAttempt = useCallback(async () => {
    const result = await startAttempt({ testId, isPreview });
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
  }, [active, testId, questions.length, isPreview, beginAttempt, abandonCurrentAttempt]);

  useEffect(() => {
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
  }, [showResults, allSelectedAnswerIds, completeAttempt, getElapsedSeconds]);

  const currentQuestion = questions[currentIndex];

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
    await abandonCurrentAttempt();
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
      dir={isSingleLanguage ? (isArabic ? "rtl" : "ltr") : undefined}
    >
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
        {headerExtra}
      </div>

      {!showResults ? (
        <div className="rounded-2xl border bg-card p-8 space-y-6 shadow-sm">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {questionProgressLabel
                ? questionProgressLabel(currentIndex + 1, questions.length)
                : `Question ${currentIndex + 1} of ${questions.length}`}
            </p>
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
            {currentQuestion!.answers.map((answer) => {
              const isSelected = (
                selectedAnswers[currentQuestion!.question._id] ?? []
              ).includes(answer._id);

              return (
                <button
                  key={answer._id}
                  type="button"
                  onClick={() =>
                    toggleAnswer(
                      currentQuestion!.question._id,
                      answer._id,
                      currentQuestion!.question.answerType,
                    )
                  }
                  className={cn(
                    "w-full rounded-xl border p-4 transition-colors hover:border-cta/40 hover:bg-cta/5",
                    isSingleLanguage
                      ? isArabic
                        ? "text-right"
                        : "text-left"
                      : "text-left",
                    isSelected &&
                      "border-cta bg-cta/10 ring-1 ring-cta/25 shadow-[0_0_0_1px_hsl(var(--cta)/0.15)]",
                  )}
                >
                  <span className="font-medium">{getAnswerText(answer)}</span>
                  {getAnswerSubtitle(answer) && (
                    <span className="block text-sm text-muted-foreground" dir="rtl">
                      {getAnswerSubtitle(answer)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex justify-between pt-2">
            <Button
              variant="outline"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            >
              {previousLabel}
            </Button>
            <Button variant="cta" onClick={handleNext} disabled={!canProceed}>
              {currentIndex === questions.length - 1 ? seeResultsLabel : nextLabel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card p-8 space-y-6 shadow-sm">
          <div className="text-center space-y-2">
            <CheckCircle2 className="mx-auto h-12 w-12 text-cta" />
            <h2 className="text-2xl font-semibold">{resultsSubtitle}</h2>
            <p className="text-muted-foreground">
              {basedOnAnswersLabel
                ? basedOnAnswersLabel(displayTestName)
                : `Based on your answers to "${displayTestName}"`}
            </p>
            {displayTestNameSecondary && (
              <p className="text-sm text-muted-foreground" dir="rtl">
                {displayTestNameSecondary}
              </p>
            )}
            {completedResults && (
              <p className="text-sm text-muted-foreground">
                {completedInLabel(
                  formatTestDuration(completedResults.durationSeconds),
                  completedResults.durationSeconds,
                )}
              </p>
            )}
          </div>

          {isFinalizing || completedResults === null ? (
            <p className="text-center text-muted-foreground">{savingResultsLabel}</p>
          ) : completedResults.courses.length === 0 ? (
            <p className="text-center text-muted-foreground">{noRecommendationsLabel}</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {completedResults.courses.map((course) => (
                <li
                  key={course._id}
                  className="rounded-xl border p-4 flex gap-3 items-start"
                >
                  {course.thumbnail_image_url ? (
                    <img
                      src={course.thumbnail_image_url}
                      alt=""
                      className="h-16 w-24 rounded-md object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-16 w-24 rounded-md bg-muted shrink-0" />
                  )}
                  <div>
                    <p className="font-medium">{getCourseName(course)}</p>
                    {getCourseSubtitle(course) && (
                      <p className="text-sm text-muted-foreground" dir="rtl">
                        {getCourseSubtitle(course)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-center gap-2 pt-2 flex-wrap">
            <Button variant="outline" onClick={() => void handleRestart()}>
              {restartLabel}
            </Button>
            {secondaryAction && (
              <Button variant="cta" asChild>
                <Link to={secondaryAction.href}>{secondaryAction.label}</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
