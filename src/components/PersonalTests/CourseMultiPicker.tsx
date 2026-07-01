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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
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
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search courses..." />
            <CommandList>
              <CommandEmpty>No course found.</CommandEmpty>
              <CommandGroup>
                {(courses ?? []).map((course) => (
                  <CommandItem
                    key={course._id}
                    value={course.name}
                    onSelect={() => toggleCourse(course._id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedCourseIds.includes(course._id) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {course.name}
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
                  className="rounded-full hover:bg-muted-foreground/20 p-0.5"
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
