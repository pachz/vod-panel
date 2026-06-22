import {
  computePlanCourseStats,
  type PlanCourseStats,
} from "./planFeatureTemplate";

export type PlanCoursePickerCourse = {
  _id: string;
  category_id: string;
  additional_category_ids?: string[];
  duration?: number | null;
  lesson_count: number;
};

export type PlanCoursePickerInput = {
  includeAllCourses: boolean;
  includedCourseIds: string[];
  includedCategoryIds: string[];
};

export function resolveOwnCourseIdsFromPicker(
  config: Pick<
    PlanCoursePickerInput,
    "includeAllCourses" | "includedCourseIds" | "includedCategoryIds"
  >,
  publishedCourses: readonly PlanCoursePickerCourse[],
): string[] {
  if (config.includeAllCourses) {
    return publishedCourses.map((course) => course._id).sort();
  }

  const courseById = new Map(publishedCourses.map((course) => [course._id, course]));
  const result = new Set<string>();

  for (const courseId of config.includedCourseIds) {
    if (courseById.has(courseId)) {
      result.add(courseId);
    }
  }

  if (config.includedCategoryIds.length > 0) {
    const categorySet = new Set(config.includedCategoryIds);
    for (const course of publishedCourses) {
      if (categorySet.has(course.category_id)) {
        result.add(course._id);
      }
      for (const categoryId of course.additional_category_ids ?? []) {
        if (categorySet.has(categoryId)) {
          result.add(course._id);
        }
      }
    }
  }

  return [...result].sort();
}

export function resolveCourseIdsFromPickerData(
  config: PlanCoursePickerInput,
  publishedCourses: readonly PlanCoursePickerCourse[],
): string[] {
  return resolveOwnCourseIdsFromPicker(config, publishedCourses);
}

export function computePlanCourseStatsForCourseIds(
  courseIds: readonly string[],
  publishedCourses: readonly PlanCoursePickerCourse[],
): PlanCourseStats {
  const courseById = new Map(publishedCourses.map((course) => [course._id, course]));
  const courses = courseIds
    .map((courseId) => courseById.get(courseId))
    .filter((course): course is PlanCoursePickerCourse => course !== undefined);
  return computePlanCourseStats(courses);
}
