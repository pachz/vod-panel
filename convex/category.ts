import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";

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

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

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
  },
  handler: async (ctx, { name, description }) => {
    await requireUser(ctx);

    const slug = slugify(name);
    const now = Date.now();

    const existing = await ctx.db
      .query("categories")
      .withIndex("name", (q) => q.eq("name", name))
      .first();

    if (existing && existing.deletedAt === undefined) {
      throw new ConvexError({
        code: "CATEGORY_EXISTS",
        message: "A category with this name already exists.",
      });
    }

    const id = await ctx.db.insert("categories", {
      name,
      description,
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
  },
  handler: async (ctx, { id, name, description }) => {
    await requireUser(ctx);

    const category = await ctx.db.get(id);

    if (!category || category.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Category not found.",
      });
    }

    const slug = slugify(name);

    const duplicates = await ctx.db
      .query("categories")
      .withIndex("name", (q) => q.eq("name", name))
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
      name,
      description,
      slug,
    });
  },
});

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

    await ctx.db.patch(id, {
      deletedAt: Date.now(),
    });
  },
});

