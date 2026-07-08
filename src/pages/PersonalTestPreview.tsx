import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PersonalTestRunner } from "@/components/PersonalTests/PersonalTestRunner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PersonalTestPreview = () => {
  const { id } = useParams<{ id: string }>();
  const testId = id as Id<"personalTests">;

  const data = useQuery(api.personalTest.getPersonalTest, { testId });
  const questions = data?.questions ?? [];

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
    <PersonalTestRunner
      testId={testId}
      testName={data.test.name}
      testNameAr={data.test.name_ar}
      questions={questions}
      isPreview
      active
      backHref={`/personal-tests/${testId}`}
      backLabel="Back to test"
      headerExtra={<Badge variant="secondary">Preview</Badge>}
      testCompletedTitle="You've completed the preview!"
      testCompletedSubtitle="Based on your answers, here are the courses that can help you the most."
      topRecommendedLabel="Top Recommended Courses For You"
      viewCourseLabel="View Course"
      getCourseHref={(courseId) => `/courses/preview/${courseId}`}
      chooseOneLabel="Choose one"
      chooseAllLabel="Choose all that apply"
      previousLabel="Previous"
      nextLabel="Next"
      seeResultsLabel="See results"
      savingResultsLabel="Saving your results…"
      noRecommendationsLabel="No course recommendations matched your answers."
      completedInLabel={(duration) => `Completed in ${duration}`}
      restartLabel="Restart preview"
      secondaryAction={{ href: `/personal-tests/${testId}`, label: "Edit test" }}
    />
  );
};

export default PersonalTestPreview;
