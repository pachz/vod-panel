import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";

import {
  categoryInputSchema,
  type CategoryInput,
} from "../shared/validation/category";
import { generateUniqueSlug, slugify } from "./utils/slug";
import { requireUser } from "./utils/auth";

export const listCategories = query(async (ctx) => {
  await requireUser(ctx);

  const categories = await ctx.db.query("categories").collect();

  return categories
    .filter((category) => category.deletedAt === undefined)
    .sort((a, b) => b.createdAt - a.createdAt);
});

export const createCategory = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    nameAr: v.string(),
    descriptionAr: v.string(),
  },
  handler: async (ctx, { name, description, nameAr, descriptionAr }) => {
    await requireUser(ctx);

    const validated = validateCategoryInput({
      name,
      description,
      nameAr,
      descriptionAr,
    });

    const baseSlug = slugify(validated.name);
    const slug = await generateUniqueSlug(ctx, "categories", baseSlug, {
      fallbackSlug: "category",
    });
    const now = Date.now();

    const existing = await ctx.db
      .query("categories")
      .withIndex("name", (q) => q.eq("name", validated.name))
      .first();

    if (existing && existing.deletedAt === undefined) {
      throw new ConvexError({
        code: "CATEGORY_EXISTS",
        message: "A category with this name already exists.",
      });
    }

    const id = await ctx.db.insert("categories", {
      name: validated.name,
      description: validated.description,
      name_ar: validated.nameAr,
      description_ar: validated.descriptionAr,
      slug,
      course_count: 0,
      createdAt: now,
    });

    return id;
  },
});

export const updateCategory = mutation({
  args: {
    id: v.id("categories"),
    name: v.string(),
    description: v.string(),
    nameAr: v.string(),
    descriptionAr: v.string(),
  },
  handler: async (ctx, { id, name, description, nameAr, descriptionAr }) => {
    await requireUser(ctx);

    const category = await ctx.db.get(id);

    if (!category || category.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Category not found.",
      });
    }

    const validated = validateCategoryInput({
      name,
      description,
      nameAr,
      descriptionAr,
    });

    const baseSlug = slugify(validated.name);
    const slug = await generateUniqueSlug(ctx, "categories", baseSlug, {
      excludeId: id,
      fallbackSlug: "category",
    });

    const duplicates = await ctx.db
      .query("categories")
      .withIndex("name", (q) => q.eq("name", validated.name))
      .collect();

    const hasDuplicate = duplicates.some(
      (item) => item._id !== id && item.deletedAt === undefined,
    );

    if (hasDuplicate) {
      throw new ConvexError({
        code: "CATEGORY_EXISTS",
        message: "A category with this name already exists.",
      });
    }

    await ctx.db.patch(id, {
      name: validated.name,
      description: validated.description,
      name_ar: validated.nameAr,
      description_ar: validated.descriptionAr,
      slug,
    });
  },
});

const validateCategoryInput = (input: CategoryInput) => {
  const result = categoryInputSchema.safeParse(input);

  if (!result.success) {
    const issue = result.error.errors[0];
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: issue?.message ?? "Invalid category input.",
    });
  }

  return result.data;
};

export const deleteCategory = mutation({
  args: {
    id: v.id("categories"),
  },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);

    const category = await ctx.db.get(id);

    if (!category || category.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Category not found.",
      });
    }

    if (category.course_count > 0) {
      throw new ConvexError({
        code: "CATEGORY_IN_USE",
        message: "You must move or delete courses assigned to this category before deleting it.",
      });
    }

    await ctx.db.patch(id, {
      deletedAt: Date.now(),
    });
  },
});

