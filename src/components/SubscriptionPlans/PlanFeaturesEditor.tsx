import { Plus, Trash2, GripVertical } from "lucide-react";
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
import type { PlanFeature } from "../../../shared/validation/plan";

type PlanFeaturesEditorProps = {
  features: PlanFeature[];
  onChange: (features: PlanFeature[]) => void;
};

export function PlanFeaturesEditor({ features, onChange }: PlanFeaturesEditorProps) {
  const addFeature = () => {
    onChange([
      ...features,
      {
        icon: "CheckCircle2",
        title: "",
        titleAr: "",
        subtitle: "",
        subtitleAr: "",
        isChecklistItem: false,
        displayOrder: features.length,
      },
    ]);
  };

  const updateFeature = (index: number, patch: Partial<PlanFeature>) => {
    onChange(
      features.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
  };

  const removeFeature = (index: number) => {
    onChange(
      features
        .filter((_, i) => i !== index)
        .map((f, i) => ({ ...f, displayOrder: i })),
    );
  };

  const sorted = [...features].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div className="space-y-4">
      {sorted.map((feature, index) => (
        <div
          key={`feature-${index}`}
          className="rounded-lg border p-4 space-y-3 bg-muted/30"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <GripVertical className="h-4 w-4" />
              <span className="text-xs font-medium">Item {index + 1}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeFeature(features.indexOf(feature))}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Icon</Label>
              <Select
                value={feature.icon}
                onValueChange={(v) =>
                  updateFeature(features.indexOf(feature), { icon: v })
                }
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
                value={feature.displayOrder}
                onChange={(e) =>
                  updateFeature(features.indexOf(feature), {
                    displayOrder: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Title (EN)</Label>
              <Input
                value={feature.title}
                onChange={(e) =>
                  updateFeature(features.indexOf(feature), { title: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Title (AR)</Label>
              <Input
                value={feature.titleAr ?? ""}
                onChange={(e) =>
                  updateFeature(features.indexOf(feature), { titleAr: e.target.value })
                }
                dir="rtl"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Subtitle (EN)</Label>
              <Input
                value={feature.subtitle ?? ""}
                onChange={(e) =>
                  updateFeature(features.indexOf(feature), { subtitle: e.target.value })
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Subtitle (AR)</Label>
              <Input
                value={feature.subtitleAr ?? ""}
                onChange={(e) =>
                  updateFeature(features.indexOf(feature), { subtitleAr: e.target.value })
                }
                dir="rtl"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`checklist-${index}`}
              checked={feature.isChecklistItem}
              onCheckedChange={(checked) =>
                updateFeature(features.indexOf(feature), {
                  isChecklistItem: checked === true,
                })
              }
            />
            <Label htmlFor={`checklist-${index}`} className="text-sm font-normal">
              Mark as checklist item (for future admin fulfillment)
            </Label>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={addFeature} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Add feature
      </Button>
    </div>
  );
}
