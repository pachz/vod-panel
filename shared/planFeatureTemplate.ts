export type PlanCourseStats = {
  courses: number;
  lessons: number;
  hours: number;
};

export const EMPTY_PLAN_COURSE_STATS: PlanCourseStats = {
  courses: 0,
  lessons: 0,
  hours: 0,
};

export type PlanFeatureSubtitleMode = "manual" | "template";

export type PlanFeatureLike = {
  subtitle?: string;
  subtitleAr?: string;
  subtitleMode?: PlanFeatureSubtitleMode;
  subtitleTemplate?: string;
  subtitleTemplateAr?: string;
};

export const PLAN_FEATURE_VARIABLES = [
  { key: "hours", label: "Hours", token: "{{hours}}" },
  { key: "courses", label: "Courses", token: "{{courses}}" },
  { key: "lessons", label: "Lessons", token: "{{lessons}}" },
] as const;

export const DEFAULT_COURSE_STATS_TEMPLATE_EN =
  "{{hours}} hours • {{courses}} courses • {{lessons}} lessons";

export const DEFAULT_COURSE_STATS_TEMPLATE_AR =
  "{{hours}} ساعة • {{courses}} دورة • {{lessons}} درس";

export function computePlanCourseStats(
  courses: ReadonlyArray<{ duration?: number | null; lesson_count: number }>,
): PlanCourseStats {
  const coursesCount = courses.length;
  const lessons = courses.reduce((sum, course) => sum + course.lesson_count, 0);
  const totalSeconds = courses.reduce((sum, course) => sum + (course.duration ?? 0), 0);
  const hours = Math.round(totalSeconds / 3600);
  return { courses: coursesCount, lessons, hours };
}

function applyTemplate(
  template: string,
  stats: PlanCourseStats,
): string {
  return template
    .replaceAll("{{hours}}", String(stats.hours))
    .replaceAll("{{courses}}", String(stats.courses))
    .replaceAll("{{lessons}}", String(stats.lessons));
}

export function resolvePlanFeatureSubtitle(
  feature: PlanFeatureLike,
  stats: PlanCourseStats,
  options?: { useArabic?: boolean },
): string | undefined {
  const mode = feature.subtitleMode ?? "manual";
  if (mode === "template") {
    const template = options?.useArabic
      ? feature.subtitleTemplateAr?.trim() || feature.subtitleTemplate?.trim()
      : feature.subtitleTemplate?.trim();
    if (!template) {
      return undefined;
    }
    return applyTemplate(template, stats);
  }

  const manual = options?.useArabic
    ? feature.subtitleAr?.trim() || feature.subtitle?.trim()
    : feature.subtitle?.trim();
  return manual || undefined;
}

export function resolvePlanFeaturesForDisplay<
  T extends PlanFeatureLike & {
    icon: string;
    title: string;
    title_ar?: string;
    titleAr?: string;
    isChecklistItem: boolean;
    displayOrder: number;
  },
>(
  features: T[],
  stats: PlanCourseStats,
): Array<
  T & {
    subtitle?: string;
    subtitle_ar?: string;
  }
> {
  return features.map((feature) => {
    const subtitle = resolvePlanFeatureSubtitle(feature, stats, { useArabic: false });
    const subtitle_ar = resolvePlanFeatureSubtitle(feature, stats, { useArabic: true });
    return {
      ...feature,
      subtitle,
      subtitle_ar,
    };
  });
}
