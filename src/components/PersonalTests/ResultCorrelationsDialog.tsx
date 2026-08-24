import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { ListChecks, Target } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { hexToRgba, isResultColor } from "./resultColor";

export type CorrelationAnswer = {
  _id: Id<"personalTestAnswers">;
  text: string;
  resultIds: Array<Id<"personalTestResults">>;
};

export type CorrelationResult = {
  _id: Id<"personalTestResults">;
  title: string;
  color?: string;
};

type ResultCorrelationsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testId: Id<"personalTests">;
  questionId: Id<"personalTestQuestions">;
  questionNumber: number;
  questionTitle: string;
  answers: CorrelationAnswer[];
  results: CorrelationResult[];
};

type Connector = {
  answerId: Id<"personalTestAnswers">;
  resultId: Id<"personalTestResults">;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

function letterForIndex(index: number) {
  return String.fromCharCode(65 + (index % 26));
}

function curvePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(48, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function mappingsFromAnswers(answers: CorrelationAnswer[]) {
  const next: Record<string, Array<Id<"personalTestResults">>> = {};
  for (const answer of answers) {
    next[answer._id] = [...answer.resultIds];
  }
  return next;
}

/** Convert a node's visual center into the container's layout/SVG coordinates. */
function centerInContainer(node: HTMLElement, container: HTMLElement) {
  const nodeRect = node.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const scaleX =
    containerRect.width === 0 ? 1 : container.offsetWidth / containerRect.width;
  const scaleY =
    containerRect.height === 0
      ? 1
      : container.offsetHeight / containerRect.height;
  return {
    x: (nodeRect.left + nodeRect.width / 2 - containerRect.left) * scaleX,
    y: (nodeRect.top + nodeRect.height / 2 - containerRect.top) * scaleY,
  };
}

export function ResultCorrelationsDialog({
  open,
  onOpenChange,
  testId,
  questionId,
  questionNumber,
  questionTitle,
  answers,
  results,
}: ResultCorrelationsDialogProps) {
  const saveCorrelations = useMutation(
    api.personalTest.savePersonalTestQuestionResultCorrelations,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const answerNodeRefs = useRef(new Map<string, HTMLSpanElement>());
  const resultNodeRefs = useRef(new Map<string, HTMLSpanElement>());

  const [selectedAnswerId, setSelectedAnswerId] = useState<
    Id<"personalTestAnswers"> | null
  >(() => answers[0]?._id ?? null);
  const [mappings, setMappings] = useState<
    Record<string, Array<Id<"personalTestResults">>>
  >(() => mappingsFromAnswers(answers));
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const resultColorById = useMemo(() => {
    const map = new Map<Id<"personalTestResults">, string>();
    for (const result of results) {
      if (isResultColor(result.color)) {
        map.set(result._id, result.color);
      }
    }
    return map;
  }, [results]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setMappings(mappingsFromAnswers(answers));
    setSelectedAnswerId(answers[0]?._id ?? null);
  }, [open, answers]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const measure = () => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const next: Connector[] = [];
      for (const answer of answers) {
        const resultIds = mappings[answer._id] ?? answer.resultIds;
        const answerNode = answerNodeRefs.current.get(answer._id);
        if (!answerNode) {
          continue;
        }
        const from = centerInContainer(answerNode, container);
        for (const resultId of resultIds) {
          const resultNode = resultNodeRefs.current.get(resultId);
          if (!resultNode) {
            continue;
          }
          const to = centerInContainer(resultNode, container);
          next.push({
            answerId: answer._id,
            resultId,
            x1: from.x,
            y1: from.y,
            x2: to.x,
            y2: to.y,
          });
        }
      }
      setConnectors(next);
    };

    measure();

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      measure();
      secondFrame = window.requestAnimationFrame(measure);
    });
    const timeoutId = window.setTimeout(measure, 220);

    const container = containerRef.current;
    const dialog = container?.closest('[role="dialog"]');
    const onAnimationEnd = () => {
      measure();
    };
    dialog?.addEventListener("animationend", onAnimationEnd);
    dialog?.addEventListener("transitionend", onAnimationEnd);

    const observer =
      container && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            measure();
          })
        : null;
    if (container && observer) {
      observer.observe(container);
    }
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(timeoutId);
      dialog?.removeEventListener("animationend", onAnimationEnd);
      dialog?.removeEventListener("transitionend", onAnimationEnd);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [open, answers, results, mappings, selectedAnswerId]);

  const selectedResultIds = useMemo(() => {
    if (!selectedAnswerId) {
      return new Set<Id<"personalTestResults">>();
    }
    return new Set(mappings[selectedAnswerId] ?? []);
  }, [mappings, selectedAnswerId]);

  const toggleResult = (resultId: Id<"personalTestResults">) => {
    if (!selectedAnswerId) {
      return;
    }
    setMappings((current) => {
      const existing = current[selectedAnswerId] ?? [];
      const alreadyMapped = existing.includes(resultId);
      return {
        ...current,
        [selectedAnswerId]: alreadyMapped
          ? existing.filter((id) => id !== resultId)
          : [...existing, resultId],
      };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveCorrelations({
        testId,
        questionId,
        mappings: answers.map((answer) => ({
          answerId: answer._id,
          resultIds: mappings[answer._id] ?? [],
        })),
      });
      toast.success("Result correlations saved.");
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>
            Result Correlations <span className="text-muted-foreground">›</span>{" "}
            Question {questionNumber}
          </DialogTitle>
          <DialogDescription>
            Map your question answers to your quiz results.
            {questionTitle ? ` “${questionTitle}”` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
          {results.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Add results in the Results tab first, then map answers to them
              here.
            </div>
          ) : answers.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              This question has no answers yet.
            </div>
          ) : (
            <div
              ref={containerRef}
              className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-6 py-2"
            >
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                aria-hidden="true"
              >
                {connectors.map((connector) => {
                  const isActive = connector.answerId === selectedAnswerId;
                  const accent = resultColorById.get(connector.resultId);
                  return (
                    <path
                      key={`${connector.answerId}-${connector.resultId}`}
                      d={curvePath(
                        connector.x1,
                        connector.y1,
                        connector.x2,
                        connector.y2,
                      )}
                      fill="none"
                      stroke={accent}
                      className={
                        accent
                          ? undefined
                          : isActive
                            ? "stroke-cta"
                            : "stroke-muted-foreground/30"
                      }
                      strokeOpacity={accent && !isActive ? 0.4 : 1}
                      strokeLinecap="round"
                      strokeWidth={isActive ? 3 : 1.5}
                    />
                  );
                })}
              </svg>

              <div className="space-y-3">
                <div className="rounded-xl bg-muted/60 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background">
                      <ListChecks className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold">Answers</p>
                      <p className="text-sm text-muted-foreground">
                        When a user selects this answer…
                      </p>
                    </div>
                  </div>
                </div>
                {answers.map((answer, index) => {
                  const isSelected = selectedAnswerId === answer._id;
                  return (
                    <button
                      key={answer._id}
                      type="button"
                      onClick={() => setSelectedAnswerId(answer._id)}
                      className={cn(
                        "relative flex w-full items-center gap-3 rounded-xl border bg-background px-3 py-3 text-left shadow-sm transition-colors",
                        isSelected
                          ? "border-cta bg-cta/10"
                          : "hover:bg-muted/40",
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold">
                        {letterForIndex(index)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {answer.text}
                      </span>
                      <span
                        ref={(node) => {
                          if (node) {
                            answerNodeRefs.current.set(answer._id, node);
                          } else {
                            answerNodeRefs.current.delete(answer._id);
                          }
                        }}
                        className={cn(
                          "absolute -right-2 h-4 w-4 rounded-full border-2 bg-background",
                          isSelected
                            ? "border-cta bg-cta"
                            : "border-muted-foreground/40",
                        )}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="flex h-full items-center justify-center pt-16 text-sm font-medium text-muted-foreground">
                Correlates to →
              </div>

              <div className="space-y-3">
                <div className="rounded-xl bg-muted/60 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background">
                      <Target className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold">Results</p>
                      <p className="text-sm text-muted-foreground">
                        …it will correlate to chosen results
                      </p>
                    </div>
                  </div>
                </div>
                {results.map((result, index) => {
                  const isMapped = selectedResultIds.has(result._id);
                  const accent = resultColorById.get(result._id);
                  return (
                    <button
                      key={result._id}
                      type="button"
                      onClick={() => toggleResult(result._id)}
                      disabled={!selectedAnswerId}
                      className={cn(
                        "relative flex w-full items-center gap-3 rounded-xl border bg-background px-3 py-3 text-left shadow-sm transition-colors disabled:opacity-60",
                        isMapped && !accent && "border-cta bg-cta/10",
                        !isMapped && "hover:bg-muted/40",
                      )}
                      style={
                        isMapped && accent
                          ? {
                              borderColor: accent,
                              backgroundColor: hexToRgba(accent, 0.12),
                            }
                          : undefined
                      }
                    >
                      <span
                        ref={(node) => {
                          if (node) {
                            resultNodeRefs.current.set(result._id, node);
                          } else {
                            resultNodeRefs.current.delete(result._id);
                          }
                        }}
                        className={cn(
                          "absolute -left-2 h-4 w-4 rounded-full border-2 bg-background",
                          isMapped && !accent && "border-cta bg-cta",
                          !isMapped && "border-muted-foreground/40",
                        )}
                        style={
                          accent
                            ? {
                                borderColor: accent,
                                backgroundColor: isMapped ? accent : undefined,
                              }
                            : undefined
                        }
                      />
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold"
                        style={
                          accent
                            ? {
                                backgroundColor: hexToRgba(accent, 0.16),
                                color: accent,
                              }
                            : undefined
                        }
                      >
                        {index + 1}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate font-medium"
                        style={accent ? { color: accent } : undefined}
                      >
                        {result.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Close
          </Button>
          <Button
            type="button"
            variant="cta"
            onClick={() => {
              void handleSave();
            }}
            disabled={isSaving || results.length === 0 || answers.length === 0}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
