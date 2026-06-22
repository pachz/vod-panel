import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

type LimitedInputProps = Omit<ComponentProps<typeof Input>, "maxLength"> & {
  maxLength: number;
  showCount?: boolean;
};

export function LimitedInput({
  maxLength,
  showCount = true,
  value,
  className,
  ...props
}: LimitedInputProps) {
  const text = typeof value === "string" ? value : String(value ?? "");
  return (
    <div className="space-y-1">
      <Input maxLength={maxLength} value={value} className={className} {...props} />
      {showCount && <FieldCharCount length={text.length} max={maxLength} />}
    </div>
  );
}

type LimitedTextareaProps = Omit<ComponentProps<typeof Textarea>, "maxLength"> & {
  maxLength: number;
  showCount?: boolean;
};

export function LimitedTextarea({
  maxLength,
  showCount = true,
  value,
  className,
  ...props
}: LimitedTextareaProps) {
  const text = typeof value === "string" ? value : String(value ?? "");
  return (
    <div className="space-y-1">
      <Textarea maxLength={maxLength} value={value} className={className} {...props} />
      {showCount && <FieldCharCount length={text.length} max={maxLength} />}
    </div>
  );
}
