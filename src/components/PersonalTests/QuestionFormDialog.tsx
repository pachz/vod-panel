import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CourseMultiPicker } from "./CourseMultiPicker";
import { personalTestQuestionSchema } from "../../../shared/validation/personalTest";

export type QuestionFormValues = {
  title: string;
  titleAr: string;
  answerType: "single" | "multi";
  answers: Array<{
    text: string;
    textAr: string;
    recommendedCourseIds: Id<"courses">[];
  }>;
};

const emptyAnswer = () => ({
  text: "",
  textAr: "",
  recommendedCourseIds: [] as Id<"courses">[],
});

const initialValues: QuestionFormValues = {
  title: "",
  titleAr: "",
  answerType: "single",
  answers: [emptyAnswer()],
};

type QuestionFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: QuestionFormValues;
  onSave: (values: QuestionFormValues) => Promise<void>;
  isSaving?: boolean;
  mode: "create" | "edit";
};

export function QuestionFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  isSaving = false,
  mode,
}: QuestionFormDialogProps) {
  const [values, setValues] = useState<QuestionFormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(initial ?? initialValues);
      setError(null);
    }
  }, [open, initial]);

  const updateAnswer = (
    index: number,
    patch: Partial<QuestionFormValues["answers"][number]>,
  ) => {
    setValues((prev) => ({
      ...prev,
      answers: prev.answers.map((answer, i) =>
        i === index ? { ...answer, ...patch } : answer,
      ),
    }));
  };

  const handleSave = async (event?: FormEvent) => {
    event?.preventDefault();
    const result = personalTestQuestionSchema.safeParse({
      title: values.title,
      titleAr: values.titleAr,
      answerType: values.answerType,
      answers: values.answers.map((a) => ({
        text: a.text,
        textAr: a.textAr,
        recommendedCourseIds: a.recommendedCourseIds.map(String),
      })),
    });

    if (!result.success) {
      setError(result.error.errors[0]?.message ?? "Invalid question.");
      return;
    }

    setError(null);
    await onSave(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add question" : "Edit question"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="question-title">Question title</Label>
              <Input
                id="question-title"
                value={values.title}
                onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="question-title-ar">Question title (Arabic)</Label>
              <Input
                id="question-title-ar"
                value={values.titleAr}
                dir="rtl"
                onChange={(e) => setValues((v) => ({ ...v, titleAr: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Answer type</Label>
            <Select
              value={values.answerType}
              onValueChange={(value: "single" | "multi") =>
                setValues((v) => ({ ...v, answerType: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single choice</SelectItem>
                <SelectItem value="multi">Multiple choice</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Answers</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setValues((v) => ({ ...v, answers: [...v.answers, emptyAnswer()] }))
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                Add answer
              </Button>
            </div>

            {values.answers.map((answer, index) => (
              <div key={index} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Answer {index + 1}
                  </span>
                  {values.answers.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() =>
                        setValues((v) => ({
                          ...v,
                          answers: v.answers.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Answer</Label>
                    <Input
                      value={answer.text}
                      onChange={(e) => updateAnswer(index, { text: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Answer (Arabic)</Label>
                    <Input
                      value={answer.textAr}
                      dir="rtl"
                      onChange={(e) => updateAnswer(index, { textAr: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Recommended courses</Label>
                  <CourseMultiPicker
                    selectedCourseIds={answer.recommendedCourseIds}
                    onChange={(ids) => updateAnswer(index, { recommendedCourseIds: ids })}
                  />
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="cta" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save question"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
