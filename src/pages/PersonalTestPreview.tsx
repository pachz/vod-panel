import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PersonalTestPreview = () => {
  const { id } = useParams<{ id: string }>();
  const testId = id as Id<"personalTests">;

  const data = useQuery(api.personalTest.getPersonalTest, { testId });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, Id<"personalTestAnswers">[]>
  >({});
  const [showResults, setShowResults] = useState(false);

  const questions = data?.questions ?? [];

  const allSelectedAnswerIds = useMemo(
    () => Object.values(selectedAnswers).flat(),
    [selectedAnswers],
  );

  const results = useQuery(
    api.personalTest.computePersonalTestResults,
    showResults && allSelectedAnswerIds.length > 0
      ? { testId, selectedAnswerIds: allSelectedAnswerIds }
      : "skip",
  );

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

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedAnswers({});
    setShowResults(false);
  };

  if (data === undefined) {
    return <p className="text-muted-foreground">Loading preview…</p>;
  }

  if (data === null) {
    return (
      <div className="space-y-4">
        <p>Test not found.</p>
        <Button variant="outline" asChild>
          <Link to="/personal-tests">Back to tests</Link>
        </Button>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 text-center py-16">
        <h1 className="text-2xl font-semibold">{data.test.name}</h1>
        <p className="text-muted-foreground">Add questions before previewing this test.</p>
        <Button variant="cta" asChild>
          <Link to={`/personal-tests/${testId}`}>Edit test</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/personal-tests/${testId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to test
          </Link>
        </Button>
        <Badge variant="secondary">Preview</Badge>
      </div>

      {!showResults ? (
        <div className="rounded-2xl border bg-card p-8 space-y-6 shadow-sm">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Question {currentIndex + 1} of {questions.length}
            </p>
            <h2 className="text-xl font-semibold">{currentQuestion!.question.title}</h2>
            <p className="text-muted-foreground" dir="rtl">
              {currentQuestion!.question.title_ar}
            </p>
            <Badge variant="outline" className="mt-2">
              {currentQuestion!.question.answerType === "single"
                ? "Choose one"
                : "Choose all that apply"}
            </Badge>
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
                    "w-full rounded-xl border p-4 text-left transition-colors hover:bg-accent/50",
                    isSelected && "border-primary bg-primary/5 ring-1 ring-primary/20",
                  )}
                >
                  <span className="font-medium">{answer.text}</span>
                  <span className="block text-sm text-muted-foreground" dir="rtl">
                    {answer.text_ar}
                  </span>
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
              Previous
            </Button>
            <Button variant="cta" onClick={handleNext} disabled={!canProceed}>
              {currentIndex === questions.length - 1 ? "See results" : "Next"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card p-8 space-y-6 shadow-sm">
          <div className="text-center space-y-2">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
            <h2 className="text-2xl font-semibold">Your recommended courses</h2>
            <p className="text-muted-foreground">
              Based on your answers to &ldquo;{data.test.name}&rdquo;
            </p>
          </div>

          {results === undefined ? (
            <p className="text-center text-muted-foreground">Calculating results…</p>
          ) : results.courses.length === 0 ? (
            <p className="text-center text-muted-foreground">
              No course recommendations matched your answers.
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {results.courses.map((course) => (
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
                    <p className="font-medium">{course.name}</p>
                    <p className="text-sm text-muted-foreground" dir="rtl">
                      {course.name_ar}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-center gap-2 pt-2">
            <Button variant="outline" onClick={handleRestart}>
              Restart preview
            </Button>
            <Button variant="cta" asChild>
              <Link to={`/personal-tests/${testId}`}>Edit test</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonalTestPreview;
