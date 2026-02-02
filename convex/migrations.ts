import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api.js";
import type { DataModel } from "./_generated/dataModel.js";

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();

/**
 * Backfill courses.name_search from name + name_ar for full-text search.
 */
export const backfillCoursesNameSearch = migrations.define({
  table: "courses",
  migrateOne: (_ctx, course) => {
    if (course.name_search !== undefined) return;
    const combined = [course.name, course.name_ar].filter(Boolean).join(" ").trim();
    return { name_search: combined || undefined };
  },
});

/**
 * Backfill lessons.title_search from title + title_ar for full-text search.
 */
export const backfillLessonsTitleSearch = migrations.define({
  table: "lessons",
  migrateOne: (_ctx, lesson) => {
    if (lesson.title_search !== undefined) return;
    const combined = [lesson.title, lesson.title_ar].filter(Boolean).join(" ").trim();
    return { title_search: combined || undefined };
  },
});

/** Run both backfill migrations in order. */
export const runAll = migrations.runner([
  internal.migrations.backfillCoursesNameSearch,
  internal.migrations.backfillLessonsTitleSearch,
]);
