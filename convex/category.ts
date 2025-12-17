import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { TableAggregate } from "@convex-dev/aggregate";

import {
  categoryInputSchema,
  type CategoryInput,
} from "../shared/validation/category";
import { generateUniqueSlug, slugify } from "./utils/slug";
import { requireUser } from "./utils/auth";
import { logActivity } from "./utils/activityLog";

// Initialize the aggregate for counting categories by status
const categoryAggregate = new TableAggregate<
  {
    Key: string; // "active" or "deleted"
    DataModel: DataModel;
    TableName: "categories";
  }
>(components.aggregateCategories, {
  sortKey: (doc) => {
    // Use "active" for non-deleted categories, "deleted" for deleted ones
    return doc.deletedAt === undefined ? "active" : "deleted";
  },
});

export const listCategories = query(async (ctx) => {
  await requireUser(ctx);

  const categories = await ctx.db.query("categories").collect();

  return categories
    .filter((category) => category.deletedAt === undefined)
    .sort((a, b) => b.createdAt - a.createdAt);
});

export const listDeletedCategories = query(async (ctx) => {
  await requireUser(ctx);

  const categories = await ctx.db.query("categories").collect();

  return categories
    .filter((category) => category.deletedAt !== undefined)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
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

    // Update aggregate - get the document and insert it
    const category = await ctx.db.get(id);
    if (category) {
      await categoryAggregate.insert(ctx, category);
    }

    await logActivity({
      ctx,
      entityType: "category",
      action: "created",
      entityId: id,
      entityName: validated.name,
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

    await logActivity({
      ctx,
      entityType: "category",
      action: "updated",
      entityId: id,
      entityName: validated.name,
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

    // Get the updated document
    const updatedCategory = await ctx.db.get(id);
    if (updatedCategory) {
      // Delete using old document state (category has deletedAt undefined)
      // Insert using new document state (updatedCategory has deletedAt set)
      await categoryAggregate.delete(ctx, category);
      await categoryAggregate.insert(ctx, updatedCategory);
    }

    await logActivity({
      ctx,
      entityType: "category",
      action: "deleted",
      entityId: id,
      entityName: category.name,
    });
  },
});

export const restoreCategory = mutation({
  args: {
    id: v.id("categories"),
  },
  handler: async (ctx, { id }) => {
    await requireUser(ctx);

    const category = await ctx.db.get(id);

    if (!category || !category.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Deleted category not found.",
      });
    }

    // Check for duplicate name
    const duplicates = await ctx.db
      .query("categories")
      .withIndex("name", (q) => q.eq("name", category.name))
      .collect();

    const hasDuplicate = duplicates.some(
      (item) => item._id !== id && item.deletedAt === undefined
    );

    if (hasDuplicate) {
      throw new ConvexError({
        code: "CATEGORY_EXISTS",
        message: "A category with this name already exists. Cannot restore.",
      });
    }

    // Restore the category by removing deletedAt
    await ctx.db.patch(id, {
      deletedAt: undefined,
    });

    // Get the updated document
    const updatedCategory = await ctx.db.get(id);
    if (updatedCategory) {
      // Delete using old document state (category has deletedAt set)
      // Insert using new document state (updatedCategory has deletedAt undefined)
      await categoryAggregate.delete(ctx, category);
      await categoryAggregate.insert(ctx, updatedCategory);
    }

    await logActivity({
      ctx,
      entityType: "category",
      action: "updated",
      entityId: id,
      entityName: category.name,
    });
  },
});

// Query to get category counts by status
export const getCategoryCountByStatus = query(async (ctx) => {
  await requireUser(ctx);

  const activeCount = await categoryAggregate.count(ctx, {
    bounds: { lower: { key: "active", inclusive: true }, upper: { key: "active", inclusive: true } },
  });

  const deletedCount = await categoryAggregate.count(ctx, {
    bounds: { lower: { key: "deleted", inclusive: true }, upper: { key: "deleted", inclusive: true } },
  });

  return {
    active: activeCount,
    deleted: deletedCount,
    total: activeCount + deletedCount,
  };
});

// Migration function to initialize aggregate with existing categories
// Run this once after setting up the aggregate to populate it with existing data
export const initializeCategoryAggregate = mutation(async (ctx) => {
  await requireUser(ctx);

  const categories = await ctx.db.query("categories").collect();
  let initialized = 0;

  for (const category of categories) {
    // Key is automatically determined from document via sortKey
    await categoryAggregate.insert(ctx, category);
    initialized++;
  }

  return { initialized, total: categories.length };
});

