import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type CourseMultiPickerProps = {
  selectedCourseIds: Id<"courses">[];
  onChange: (ids: Id<"courses">[]) => void;
  disabled?: boolean;
};

const stopScrollPropagation = (event: React.WheelEvent | React.TouchEvent) => {
  event.stopPropagation();
};

export function CourseMultiPicker({
  selectedCourseIds,
  onChange,
  disabled = false,
}: CourseMultiPickerProps) {
  const courses = useQuery(api.plans.listCoursesForPicker);
  const [open, setOpen] = useState(false);

  const courseMap = useMemo(() => {
    const map = new Map<Id<"courses">, string>();
    for (const course of courses ?? []) {
      map.set(course._id, course.name);
    }
    return map;
  }, [courses]);

  const toggleCourse = (id: Id<"courses">) => {
    if (selectedCourseIds.includes(id)) {
      onChange(selectedCourseIds.filter((c) => c !== id));
    } else {
      onChange([...selectedCourseIds, id]);
    }
  };

  const removeCourse = (id: Id<"courses">) => {
    onChange(selectedCourseIds.filter((c) => c !== id));
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            disabled={disabled || courses === undefined}
          >
            {selectedCourseIds.length > 0
              ? `${selectedCourseIds.length} course${selectedCourseIds.length !== 1 ? "s" : ""} selected`
              : "Select recommended courses..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="z-[100] w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          side="bottom"
          collisionPadding={12}
          onWheel={stopScrollPropagation}
          onTouchMove={stopScrollPropagation}
        >
          <Command className="max-h-[min(320px,50vh)]">
            <CommandInput placeholder="Search courses..." />
            <CommandList
              className="max-h-[min(260px,40vh)] overscroll-contain"
              onWheel={stopScrollPropagation}
              onTouchMove={stopScrollPropagation}
            >
              <CommandEmpty>No course found.</CommandEmpty>
              <CommandGroup className="overflow-visible">
                {(courses ?? []).map((course) => (
                  <CommandItem
                    key={course._id}
                    value={`${course.name} ${course.name_ar}`}
                    keywords={[course.name, course.name_ar]}
                    onSelect={() => toggleCourse(course._id)}
                    onMouseDown={(event) => {
                      // Keep popover open for multi-select and avoid focus traps stealing scroll.
                      event.preventDefault();
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        selectedCourseIds.includes(course._id) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{course.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedCourseIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedCourseIds.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1 pr-1">
              {courseMap.get(id) ?? "Course"}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeCourse(id)}
                  className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
