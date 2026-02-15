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

/**
 * Normalize user emails to lowercase for case-insensitive login.
 */
export const normalizeUserEmails = migrations.define({
  table: "users",
  migrateOne: (_ctx, user) => {
    const email = user.email;
    if (!email || email === email.toLowerCase()) return;
    return { email: email.toLowerCase() };
  },
});

/**
 * Normalize auth account providerAccountId (email) to lowercase for password provider.
 */
export const normalizeAuthAccountEmails = migrations.define({
  table: "authAccounts",
  migrateOne: (_ctx, account) => {
    if (account.provider !== "password") return;
    const id = account.providerAccountId;
    if (!id || id === id.toLowerCase()) return;
    return { providerAccountId: id.toLowerCase() };
  },
});

/**
 * Create default chapter for each course and set default_chapter_id.
 * Runs on courses table - for each course without default_chapter_id,
 * creates a "Course Content" chapter and links it.
 */
export const addDefaultChaptersToCourses = migrations.define({
  table: "courses",
  migrateOne: async (ctx, course) => {
    if (course.deletedAt !== undefined) return;
    if ("default_chapter_id" in course && course.default_chapter_id != null) return;

    const now = Date.now();
    const chapterId = await ctx.db.insert("chapters", {
      course_id: course._id,
      title: "Course Content",
      title_ar: "محتوى الدورة",
      displayOrder: 0,
      createdAt: now,
    });

    return { default_chapter_id: chapterId };
  },
});

/**
 * Assign each lesson to its course's default chapter.
 * Must run after addDefaultChaptersToCourses.
 */
export const assignLessonsToDefaultChapter = migrations.define({
  table: "lessons",
  migrateOne: async (ctx, lesson) => {
    if (lesson.deletedAt !== undefined) return;
    if ("chapter_id" in lesson && lesson.chapter_id != null) return;

    const course = await ctx.db.get(lesson.course_id);
    if (!course || !("default_chapter_id" in course) || !course.default_chapter_id) {
      throw new Error(
        `Course ${lesson.course_id} has no default_chapter_id. Run addDefaultChaptersToCourses first.`
      );
    }

    return { chapter_id: course.default_chapter_id };
  },
});

/** Run all migrations in order. */
export const runAll = migrations.runner([
  internal.migrations.backfillCoursesNameSearch,
  internal.migrations.backfillLessonsTitleSearch,
  internal.migrations.normalizeUserEmails,
  internal.migrations.normalizeAuthAccountEmails,
  internal.migrations.addDefaultChaptersToCourses,
  internal.migrations.assignLessonsToDefaultChapter,
]);
