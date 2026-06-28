import { useState } from "react";
import { useQuery } from "convex/react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

type PlanCourseExcludePickerProps = {
  excludedCourseIds: Id<"courses">[];
  onExcludedCoursesChange: (ids: Id<"courses">[]) => void;
};

export function PlanCourseExcludePicker({
  excludedCourseIds,
  onExcludedCoursesChange,
}: PlanCourseExcludePickerProps) {
  const courses = useQuery(api.plans.listCoursesForPicker);
  const [open, setOpen] = useState(false);

  const removeCourse = (id: Id<"courses">) => {
    onExcludedCoursesChange(excludedCourseIds.filter((courseId) => courseId !== id));
  };

  const toggleCourse = (id: Id<"courses">) => {
    if (excludedCourseIds.includes(id)) {
      onExcludedCoursesChange(excludedCourseIds.filter((courseId) => courseId !== id));
    } else {
      onExcludedCoursesChange([...excludedCourseIds, id]);
    }
  };

  return (
    <div className="space-y-2 border-t pt-4">
      <div>
        <Label>Exclude courses</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Remove specific courses from this plan even when they match &quot;all courses&quot; or a
          selected category.
        </p>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            {excludedCourseIds.length > 0
              ? `${excludedCourseIds.length} course${excludedCourseIds.length !== 1 ? "s" : ""} excluded`
              : "Select courses to exclude…"}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search courses…" />
            <CommandList>
              <CommandEmpty>No courses found.</CommandEmpty>
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
                        excludedCourseIds.includes(course._id) ? "opacity-100" : "opacity-0",
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
      {excludedCourseIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {excludedCourseIds.map((id) => {
            const course = courses?.find((c) => c._id === id);
            return (
              <Badge key={id} variant="destructive" className="gap-1 pr-1 text-xs">
                <span>{course?.name ?? id}</span>
                <button
                  type="button"
                  onClick={() => removeCourse(id)}
                  className="rounded-sm p-0.5 hover:bg-background/20"
                  aria-label={`Remove ${course?.name ?? "course"} from exclusions`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
