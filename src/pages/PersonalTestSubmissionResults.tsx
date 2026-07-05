import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatAnalyticsDateTime,
  formatSubmissionDuration,
} from "../../shared/validation/personalTestAnalytics";

function getInitials(name?: string) {
  if (!name) {
    return "?";
  }
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const PersonalTestSubmissionResults = () => {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>();
  const testId = id as Id<"personalTests">;
  const submissionAttemptId = attemptId as Id<"personalTestAttempts">;

  const submission = useQuery(api.personalTestAttemptAnalytics.getPersonalTestSubmission, {
    testId,
    attemptId: submissionAttemptId,
  });

  if (submission === undefined) {
    return <p className="text-muted-foreground">Loading submission…</p>;
  }

  if (submission === null) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link to={`/personal-tests/${testId}?tab=analytics`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to analytics
          </Link>
        </Button>
        <p>Submission not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link to={`/personal-tests/${testId}?tab=analytics`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to analytics
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Submission results</h1>
          <p className="text-sm text-muted-foreground">{submission.testName}</p>
          <p className="text-sm text-muted-foreground" dir="rtl">
            {submission.testNameAr}
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4 max-w-3xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={submission.userImage} alt={submission.userName ?? "User"} />
              <AvatarFallback>{getInitials(submission.userName)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{submission.userName ?? "Unknown user"}</p>
              {submission.userEmail && (
                <p className="text-sm text-muted-foreground">{submission.userEmail}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>Completed {formatAnalyticsDateTime(submission.completedAt)}</span>
            <span>·</span>
            <span>Time taken {formatSubmissionDuration(submission.durationSeconds)}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4 max-w-3xl">
        <h2 className="font-medium">Questions &amp; answers</h2>
        {submission.responses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No questions recorded for this test.</p>
        ) : (
          <ol className="space-y-4">
            {submission.responses.map((response, index) => (
              <li key={response.questionId} className="rounded-lg border p-4 space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Question {index + 1}
                  </p>
                  <p className="font-medium">{response.questionTitle}</p>
                  <p className="text-sm text-muted-foreground" dir="rtl">
                    {response.questionTitleAr}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Selected answer{response.answerType === "multi" ? "s" : ""}
                  </p>
                  {response.selectedAnswers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No answer selected.</p>
                  ) : (
                    <ul className="space-y-2">
                      {response.selectedAnswers.map((answer) => (
                        <li
                          key={answer.answerId}
                          className="rounded-md border bg-muted/30 px-3 py-2"
                        >
                          <p className="text-sm">{answer.text}</p>
                          <p className="text-sm text-muted-foreground" dir="rtl">
                            {answer.text_ar}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4 max-w-3xl">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Recommended courses</h2>
          <Badge variant="secondary">{submission.recommendedCourses.length}</Badge>
        </div>
        {submission.recommendedCourses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No courses were recommended.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {submission.recommendedCourses.map((course) => (
              <li
                key={course.courseId}
                className="flex gap-3 rounded-lg border p-3"
              >
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                  {course.thumbnail_image_url ? (
                    <img
                      src={course.thumbnail_image_url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{course.name}</p>
                  <p className="text-sm text-muted-foreground" dir="rtl">
                    {course.name_ar}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PersonalTestSubmissionResults;
