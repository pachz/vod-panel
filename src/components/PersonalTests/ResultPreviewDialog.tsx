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
import { isResultColor } from "./resultColor";

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
  const accent = isResultColor(result?.color) ? result.color : undefined;
  const title = isArabic ? result?.title_ar : result?.title;
  const description = isArabic ? result?.description_ar : result?.description;
  const ctaText = isArabic ? result?.ctaText_ar : result?.ctaText;
  const hasCta = Boolean(ctaText && result?.ctaUrl);

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
          <div
            className="min-h-0 flex-1 overflow-y-auto px-6 pb-6"
            dir={isArabic ? "rtl" : "ltr"}
          >
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              {result.cover_image_url ? (
                <div className="aspect-video overflow-hidden bg-muted">
                  <img
                    src={result.cover_image_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}

              <div className="space-y-4 p-5">
                <div className="space-y-2">
                  <h2
                    className="text-xl font-semibold tracking-tight"
                    style={accent ? { color: accent } : undefined}
                  >
                    {title}
                  </h2>
                  {description ? (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {description}
                    </p>
                  ) : null}
                </div>

                {hasCta ? (
                  <Button
                    asChild
                    variant={accent ? "default" : "cta"}
                    className="w-full"
                    style={
                      accent
                        ? {
                            backgroundColor: accent,
                            borderColor: accent,
                            color: "#fff",
                          }
                        : undefined
                    }
                  >
                    <a
                      href={result.ctaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {ctaText}
                    </a>
                  </Button>
                ) : null}

                {courses.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">
                      {isArabic ? "الدورات المقترحة" : "Recommended courses"}
                    </p>
                    <ul className="space-y-2">
                      {courses.map((course) => (
                        <li
                          key={course._id}
                          className="flex items-center gap-3 rounded-lg border p-2"
                        >
                          <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                            {course.imageUrl ? (
                              <img
                                src={course.imageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <span className="min-w-0 flex-1 text-sm font-medium leading-snug">
                            {isArabic ? course.name_ar : course.name}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
