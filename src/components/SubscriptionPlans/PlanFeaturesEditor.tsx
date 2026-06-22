import { Plus, Sparkles, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLAN_ICON_OPTIONS } from "./planIcons";
import { LimitedInput, LimitedTextarea } from "./planFormFields";
import type { PlanFeature } from "../../../shared/validation/plan";
import { PLAN_FIELD_LIMITS } from "../../../shared/validation/plan";
import {
  DEFAULT_COURSE_STATS_TEMPLATE_AR,
  DEFAULT_COURSE_STATS_TEMPLATE_EN,
  PLAN_FEATURE_VARIABLES,
  resolvePlanFeatureSubtitle,
  type PlanCourseStats,
} from "../../../shared/planFeatureTemplate";

type PlanFeaturesEditorProps = {
  features: PlanFeature[];
  courseStats?: PlanCourseStats | null;
  onChange: (features: PlanFeature[]) => void;
};

function insertAtCursor(
  value: string,
  token: string,
  selectionStart: number,
  selectionEnd: number,
): { next: string; cursor: number } {
  const next = value.slice(0, selectionStart) + token + value.slice(selectionEnd);
  return { next, cursor: selectionStart + token.length };
}

export function PlanFeaturesEditor({
  features,
  courseStats,
  onChange,
}: PlanFeaturesEditorProps) {
  const stats: PlanCourseStats = courseStats ?? { courses: 0, lessons: 0, hours: 0 };

  const addFeature = () => {
    if (features.length >= PLAN_FIELD_LIMITS.maxFeatures) return;
    onChange([
      ...features,
      {
        icon: "CheckCircle2",
        title: "",
        titleAr: "",
        subtitle: "",
        subtitleAr: "",
        subtitleMode: "manual",
        isChecklistItem: false,
        displayOrder: features.length,
      },
    ]);
  };

  const addCourseStatsFeature = () => {
    if (features.length >= PLAN_FIELD_LIMITS.maxFeatures) return;
    onChange([
      ...features,
      {
        icon: "GraduationCap",
        title: "Access to courses",
        titleAr: "",
        subtitleMode: "template",
        subtitleTemplate: DEFAULT_COURSE_STATS_TEMPLATE_EN,
        subtitleTemplateAr: DEFAULT_COURSE_STATS_TEMPLATE_AR,
        isChecklistItem: false,
        displayOrder: features.length,
      },
    ]);
  };

  const updateFeature = (index: number, patch: Partial<PlanFeature>) => {
    onChange(features.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const removeFeature = (index: number) => {
    onChange(
      features.filter((_, i) => i !== index).map((f, i) => ({ ...f, displayOrder: i })),
    );
  };

  const appendVariable = (
    index: number,
    field: "subtitleTemplate" | "subtitleTemplateAr",
    token: string,
    element: HTMLTextAreaElement | null,
  ) => {
    const feature = features[index];
    if (!feature) return;
    const current = feature[field] ?? "";
    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? current.length;
    const { next } = insertAtCursor(current, token, start, end);
    updateFeature(index, { [field]: next });
  };

  const sorted = [...features].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div className="space-y-4">
      {sorted.map((feature, index) => {
        const featureIndex = features.indexOf(feature);
        const isTemplate = (feature.subtitleMode ?? "manual") === "template";
        const previewEn = resolvePlanFeatureSubtitle(feature, stats, { useArabic: false });
        const previewAr = resolvePlanFeatureSubtitle(feature, stats, { useArabic: true });

        return (
          <div
            key={`feature-${featureIndex}`}
            className="rounded-lg border p-4 space-y-3 bg-muted/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <GripVertical className="h-4 w-4" />
                <span className="text-xs font-medium">Item {index + 1}</span>
                {isTemplate && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Dynamic
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeFeature(featureIndex)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select
                  value={feature.icon}
                  onValueChange={(v) => updateFeature(featureIndex, { icon: v })}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(() => {
                        const selected = PLAN_ICON_OPTIONS.find((o) => o.key === feature.icon);
                        if (!selected) return feature.icon;
                        const SelectedIcon = selected.Icon;
                        return (
                          <span className="flex items-center gap-2">
                            <SelectedIcon className="h-4 w-4 shrink-0" />
                            {selected.label}
                          </span>
                        );
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_ICON_OPTIONS.map(({ key, label, Icon }) => (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0" />
                          {label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Order</Label>
                <Input
                  type="number"
                  min={0}
                  max={PLAN_FIELD_LIMITS.featureDisplayOrder}
                  value={feature.displayOrder}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    const next = Number.isFinite(parsed)
                      ? Math.min(
                          PLAN_FIELD_LIMITS.featureDisplayOrder,
                          Math.max(0, parsed),
                        )
                      : 0;
                    updateFeature(featureIndex, { displayOrder: next });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Title (EN)</Label>
                <LimitedInput
                  maxLength={PLAN_FIELD_LIMITS.featureTitle}
                  value={feature.title}
                  onChange={(e) => updateFeature(featureIndex, { title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Title (AR)</Label>
                <LimitedInput
                  maxLength={PLAN_FIELD_LIMITS.featureTitleAr}
                  value={feature.titleAr ?? ""}
                  onChange={(e) => updateFeature(featureIndex, { titleAr: e.target.value })}
                  dir="rtl"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-md border bg-background/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-sm font-medium">Subtitle</Label>
                <Select
                  value={feature.subtitleMode ?? "manual"}
                  onValueChange={(v) =>
                    updateFeature(featureIndex, {
                      subtitleMode: v as PlanFeature["subtitleMode"],
                      ...(v === "template" && !feature.subtitleTemplate
                        ? {
                            subtitleTemplate: DEFAULT_COURSE_STATS_TEMPLATE_EN,
                            subtitleTemplateAr: DEFAULT_COURSE_STATS_TEMPLATE_AR,
                          }
                        : {}),
                    })
                  }
                >
                  <SelectTrigger className="h-8 w-[200px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual text</SelectItem>
                    <SelectItem value="template">Dynamic from courses</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isTemplate ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Pulls live counts from this plan&apos;s included courses. Click a variable to
                    insert it into the template.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {PLAN_FEATURE_VARIABLES.map((variable) => (
                      <Button
                        key={variable.key}
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs font-mono"
                        onClick={(e) => {
                          const textarea = e.currentTarget
                            .closest("[data-template-block]")
                            ?.querySelector<HTMLTextAreaElement>(
                              "textarea[data-template-field='en']",
                            );
                          appendVariable(featureIndex, "subtitleTemplate", variable.token, textarea);
                        }}
                      >
                        {variable.label}{" "}
                        <span className="text-muted-foreground ml-1">{variable.token}</span>
                      </Button>
                    ))}
                  </div>
                  <div data-template-block className="space-y-2">
                    <Label className="text-xs">Template (EN)</Label>
                    <LimitedTextarea
                      data-template-field="en"
                      rows={2}
                      maxLength={PLAN_FIELD_LIMITS.featureSubtitleTemplate}
                      value={feature.subtitleTemplate ?? ""}
                      onChange={(e) =>
                        updateFeature(featureIndex, { subtitleTemplate: e.target.value })
                      }
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PLAN_FEATURE_VARIABLES.map((variable) => (
                      <Button
                        key={`ar-${variable.key}`}
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs font-mono"
                        onClick={(e) => {
                          const textarea = e.currentTarget
                            .closest("[data-template-block-ar]")
                            ?.querySelector<HTMLTextAreaElement>(
                              "textarea[data-template-field='ar']",
                            );
                          appendVariable(
                            featureIndex,
                            "subtitleTemplateAr",
                            variable.token,
                            textarea,
                          );
                        }}
                      >
                        {variable.label}{" "}
                        <span className="text-muted-foreground ml-1">{variable.token}</span>
                      </Button>
                    ))}
                  </div>
                  <div data-template-block-ar className="space-y-2">
                    <Label className="text-xs">Template (AR)</Label>
                    <LimitedTextarea
                      data-template-field="ar"
                      rows={2}
                      maxLength={PLAN_FIELD_LIMITS.featureSubtitleTemplateAr}
                      value={feature.subtitleTemplateAr ?? ""}
                      onChange={(e) =>
                        updateFeature(featureIndex, { subtitleTemplateAr: e.target.value })
                      }
                      dir="rtl"
                      className="font-mono text-sm"
                    />
                  </div>
                  {(previewEn || previewAr) && (
                    <div className="rounded-md bg-muted/50 px-3 py-2 text-xs space-y-1">
                      <p className="font-medium text-muted-foreground">Preview</p>
                      {previewEn && <p>{previewEn}</p>}
                      {previewAr && (
                        <p dir="rtl" className="text-muted-foreground">
                          {previewAr}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-1">
                  <div className="space-y-2">
                    <Label className="text-xs">Subtitle (EN)</Label>
                    <LimitedInput
                      maxLength={PLAN_FIELD_LIMITS.featureSubtitle}
                      value={feature.subtitle ?? ""}
                      onChange={(e) =>
                        updateFeature(featureIndex, { subtitle: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Subtitle (AR)</Label>
                    <LimitedInput
                      maxLength={PLAN_FIELD_LIMITS.featureSubtitleAr}
                      value={feature.subtitleAr ?? ""}
                      onChange={(e) =>
                        updateFeature(featureIndex, { subtitleAr: e.target.value })
                      }
                      dir="rtl"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id={`checklist-${index}`}
                checked={feature.isChecklistItem}
                onCheckedChange={(checked) =>
                  updateFeature(featureIndex, {
                    isChecklistItem: checked === true,
                  })
                }
              />
              <Label htmlFor={`checklist-${index}`} className="text-sm font-normal">
                Mark as checklist item (for future admin fulfillment)
              </Label>
            </div>
          </div>
        );
      })}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={addFeature}
          className="flex-1"
          disabled={features.length >= PLAN_FIELD_LIMITS.maxFeatures}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add feature
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={addCourseStatsFeature}
          className="flex-1"
          disabled={features.length >= PLAN_FIELD_LIMITS.maxFeatures}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Add course stats line
        </Button>
      </div>
      {features.length >= PLAN_FIELD_LIMITS.maxFeatures && (
        <p className="text-xs text-muted-foreground text-center">
          Maximum {PLAN_FIELD_LIMITS.maxFeatures} features per plan.
        </p>
      )}
    </div>
  );
}
