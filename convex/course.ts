import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";

import {
  courseInputSchema,
  type CourseInput,
} from "../shared/validation/course";
import { generateUniqueSlug, slugify } from "./utils/slug";

const requireUser = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "You must be signed in to continue.",
    });
  }

  return identity;
};

const validateCourseInput = (input: CourseInput) => {
  const result = courseInputSchema.safeParse(input);

  if (!result.success) {
    const issue = result.error.errors[0];
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: issue?.message ?? "Invalid course input.",
    });
  }

  return result.data;
};

export const listCourses = query(async (ctx) => {
  await requireUser(ctx);

  const courses = await ctx.db.query("courses").collect();

  return courses
    .filter((course) => course.deletedAt === undefined)
    .sort((a, b) => b.createdAt - a.createdAt);
});

export const createCourse = mutation({
  args: {
    name: v.string(),
    nameAr: v.string(),
    shortDescription: v.string(),
    shortDescriptionAr: v.string(),
    categoryId: v.id("categories"),
  },
  handler: async (
    ctx,
    { name, nameAr, shortDescription, shortDescriptionAr, categoryId },
  ) => {
    await requireUser(ctx);

    const validated = validateCourseInput({
      name,
      nameAr,
      shortDescription,
      shortDescriptionAr,
      categoryId,
    });

    const category = await ctx.db.get(categoryId);

    if (!category || category.deletedAt) {
      throw new ConvexError({
        code: "INVALID_CATEGORY",
        message: "Selected category does not exist.",
      });
    }

    const duplicates = await ctx.db
      .query("courses")
      .withIndex("name", (q) => q.eq("name", validated.name))
      .collect();

    const hasDuplicate = duplicates.some(
      (item) => item.deletedAt === undefined,
    );

    if (hasDuplicate) {
      throw new ConvexError({
        code: "COURSE_EXISTS",
        message: "A course with this name already exists.",
      });
    }

    const baseSlug = slugify(validated.name);
    const slug = await generateUniqueSlug(ctx, "courses", baseSlug, {
      fallbackSlug: "course",
    });
    const now = Date.now();

    const courseId = await ctx.db.insert("courses", {
      name: validated.name,
      name_ar: validated.nameAr,
      short_description: validated.shortDescription,
      short_description_ar: validated.shortDescriptionAr,
      slug,
      category_id: categoryId,
      status: "draft",
      createdAt: now,
      lesson_count: 0,
    });

    await ctx.db.patch(categoryId, {
      course_count: category.course_count + 1,
    });

    return courseId;
  },
});

