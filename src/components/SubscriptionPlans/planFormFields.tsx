import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PLAN_ICON_OPTIONS } from "./planIcons";

export function FieldCharCount({ length, max }: { length: number; max: number }) {
  const nearLimit = length >= Math.floor(max * 0.9);
  const atLimit = length >= max;
  return (
    <p
      className={cn(
        "text-[11px] text-muted-foreground text-right tabular-nums",
        nearLimit && "text-amber-600 dark:text-amber-500",
        atLimit && "font-medium text-destructive",
      )}
    >
      {length}/{max}
    </p>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

type LimitedInputProps = Omit<ComponentProps<typeof Input>, "maxLength"> & {
  maxLength: number;
  showCount?: boolean;
  error?: string;
};

export function LimitedInput({
  maxLength,
  showCount = true,
  value,
  className,
  error,
  ...props
}: LimitedInputProps) {
  const text = typeof value === "string" ? value : String(value ?? "");
  return (
    <div className="space-y-1">
      <Input
        maxLength={maxLength}
        value={value}
        aria-invalid={error ? true : undefined}
        className={cn(
          error && "border-destructive focus-visible:ring-destructive",
          className,
        )}
        {...props}
      />
      {showCount && <FieldCharCount length={text.length} max={maxLength} />}
      <FieldError message={error} />
    </div>
  );
}

type LimitedTextareaProps = Omit<ComponentProps<typeof Textarea>, "maxLength"> & {
  maxLength: number;
  showCount?: boolean;
  error?: string;
};

export function LimitedTextarea({
  maxLength,
  showCount = true,
  value,
  className,
  error,
  ...props
}: LimitedTextareaProps) {
  const text = typeof value === "string" ? value : String(value ?? "");
  return (
    <div className="space-y-1">
      <Textarea
        maxLength={maxLength}
        value={value}
        aria-invalid={error ? true : undefined}
        className={cn(
          error && "border-destructive focus-visible:ring-destructive",
          className,
        )}
        {...props}
      />
      {showCount && <FieldCharCount length={text.length} max={maxLength} />}
      <FieldError message={error} />
    </div>
  );
}

type PlanIconSelectProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
};

export function PlanIconSelect({ value, onChange, label = "Title icon (optional)", id }: PlanIconSelectProps) {
  const selected = value ? PLAN_ICON_OPTIONS.find((option) => option.key === value) : undefined;
  const SelectedIcon = selected?.Icon;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || "__none__"} onValueChange={(next) => onChange(next === "__none__" ? "" : next)}>
        <SelectTrigger id={id}>
          <SelectValue>
            {selected && SelectedIcon ? (
              <span className="flex items-center gap-2">
                <SelectedIcon className="h-4 w-4 shrink-0" />
                {selected.label}
              </span>
            ) : (
              "None"
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">None</SelectItem>
          {PLAN_ICON_OPTIONS.map(({ key, label: iconLabel, Icon }) => (
            <SelectItem key={key} value={key}>
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                {iconLabel}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
