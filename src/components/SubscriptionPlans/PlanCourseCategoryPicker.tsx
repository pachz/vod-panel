import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Check, ChevronsUpDown } from "lucide-react";
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

type PlanCourseCategoryPickerProps = {
  selectedCourseIds: Id<"courses">[];
  selectedCategoryIds: Id<"categories">[];
  onCoursesChange: (ids: Id<"courses">[]) => void;
  onCategoriesChange: (ids: Id<"categories">[]) => void;
};

export function PlanCourseCategoryPicker({
  selectedCourseIds,
  selectedCategoryIds,
  onCoursesChange,
  onCategoriesChange,
}: PlanCourseCategoryPickerProps) {
  const courses = useQuery(api.plans.listCoursesForPicker);
  const categories = useQuery(api.plans.listCategoriesForPicker);
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const allCourseIds = useMemo(
    () => (courses ?? []).map((c) => c._id),
    [courses],
  );

  const allSelected =
    allCourseIds.length > 0 &&
    allCourseIds.every((id) => selectedCourseIds.includes(id));

  const toggleCourse = (id: Id<"courses">) => {
    if (selectedCourseIds.includes(id)) {
      onCoursesChange(selectedCourseIds.filter((c) => c !== id));
    } else {
      onCoursesChange([...selectedCourseIds, id]);
    }
  };

  const toggleCategory = (id: Id<"categories">) => {
    if (selectedCategoryIds.includes(id)) {
      onCategoriesChange(selectedCategoryIds.filter((c) => c !== id));
    } else {
      onCategoriesChange([...selectedCategoryIds, id]);
    }
  };

  const selectAllCourses = () => {
    onCoursesChange(allCourseIds);
  };

  const clearCourses = () => {
    onCoursesChange([]);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Courses</Label>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={selectAllCourses}>
              Select all
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearCourses}>
              Clear
            </Button>
          </div>
        </div>
        <Popover open={coursesOpen} onOpenChange={setCoursesOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              {selectedCourseIds.length > 0
                ? `${selectedCourseIds.length} course${selectedCourseIds.length !== 1 ? "s" : ""} selected`
                : "Select courses…"}
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
        {allSelected && (
          <p className="text-xs text-muted-foreground">All published courses selected manually.</p>
        )}
        {selectedCourseIds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selectedCourseIds.map((id) => {
              const course = courses?.find((c) => c._id === id);
              return (
                <Badge key={id} variant="secondary" className="text-xs">
                  {course?.name ?? id}
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Categories (include courses in any selected category)</Label>
        <Popover open={categoriesOpen} onOpenChange={setCategoriesOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              {selectedCategoryIds.length > 0
                ? `${selectedCategoryIds.length} categor${selectedCategoryIds.length !== 1 ? "ies" : "y"} selected`
                : "Select categories…"}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search categories…" />
              <CommandList>
                <CommandEmpty>No categories found.</CommandEmpty>
                <CommandGroup>
                  {(categories ?? []).map((category) => (
                    <CommandItem
                      key={category._id}
                      value={category.name}
                      onSelect={() => toggleCategory(category._id)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedCategoryIds.includes(category._id)
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {category.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedCategoryIds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selectedCategoryIds.map((id) => {
              const category = categories?.find((c) => c._id === id);
              return (
                <Badge key={id} variant="outline" className="text-xs">
                  {category?.name ?? id}
                </Badge>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
