import { useEffect, useState } from "react";

import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PersonalTestResultView } from "./PersonalTestResultView";

export type ResultPreviewValues = {
  title: string;
  title_ar: string;
  description?: string;
  description_ar?: string;
  cover_image_url?: string;
  color?: string;
  recommendedCourseIds?: Id<"courses">[];
  ctaText?: string;
  ctaText_ar?: string;
  ctaUrl?: string;
};

export type ResultPreviewCourse = {
  _id: Id<"courses">;
  name: string;
  name_ar: string;
  imageUrl?: string;
};

type ResultPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: ResultPreviewValues | null;
  courses: ResultPreviewCourse[];
};

export function ResultPreviewDialog({
  open,
  onOpenChange,
  result,
  courses,
}: ResultPreviewDialogProps) {
  const [language, setLanguage] = useState<"en" | "ar">("en");

  useEffect(() => {
    if (open) {
      setLanguage("en");
    }
  }, [open, result]);

  const isArabic = language === "ar";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col overflow-hidden p-0">
        <DialogHeader className="space-y-3 px-6 pt-6">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="space-y-1">
              <DialogTitle>Result preview</DialogTitle>
              <DialogDescription>
                How this result can look to a test taker.
              </DialogDescription>
            </div>
            <div className="flex shrink-0 rounded-md border p-0.5">
              <Button
                type="button"
                size="sm"
                variant={language === "en" ? "secondary" : "ghost"}
                className="h-7 px-2.5"
                onClick={() => setLanguage("en")}
              >
                EN
              </Button>
              <Button
                type="button"
                size="sm"
                variant={language === "ar" ? "secondary" : "ghost"}
                className="h-7 px-2.5"
                onClick={() => setLanguage("ar")}
              >
                AR
              </Button>
            </div>
          </div>
        </DialogHeader>

        {result && (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            <PersonalTestResultView
              result={result}
              courses={courses}
              isArabic={isArabic}
              recommendedCoursesLabel={
                isArabic ? "الدورات المقترحة" : "Recommended courses"
              }
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
