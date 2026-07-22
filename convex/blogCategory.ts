import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";

import {
  blogCategoryInputSchema,
  type BlogCategoryInput,
} from "../shared/validation/blogCategory";
import { generateUniqueSlug, slugify } from "./utils/slug";
import { requireUser } from "./utils/auth";

function validateBlogCategoryInput(input: BlogCategoryInput) {
  const result = blogCategoryInputSchema.safeParse(input);
  if (!result.success) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: result.error.errors[0]?.message ?? "Invalid category input.",
    });
  }
  return result.data;
}

const blogCategoryValidator = v.object({
  _id: v.id("blogCategories"),
  _creationTime: v.number(),
  name: v.string(),
  name_ar: v.string(),
  slug: v.string(),
  color: v.string(),
  blog_count: v.number(),
  createdAt: v.number(),
  deletedAt: v.optional(v.number()),
});

export const listBlogCategories = query({
  args: {},
  returns: v.array(blogCategoryValidator),
  handler: async (ctx) => {
    await requireUser(ctx, { requireTech: true });

    const categories = await ctx.db
      .query("blogCategories")
      .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();

    return categories.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listDeletedBlogCategories = query({
  args: {},
  returns: v.array(blogCategoryValidator),
  handler: async (ctx) => {
    await requireUser(ctx, { requireTech: true });

    const categories = await ctx.db.query("blogCategories").collect();

    return categories
      .filter((category) => category.deletedAt !== undefined)
      .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  },
});

export const createBlogCategory = mutation({
  args: {
    name: v.string(),
    nameAr: v.string(),
    color: v.string(),
  },
  returns: v.id("blogCategories"),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });

    const validated = validateBlogCategoryInput(args);

    const existing = await ctx.db
      .query("blogCategories")
      .withIndex("name", (q) => q.eq("name", validated.name))
      .first();

    if (existing && existing.deletedAt === undefined) {
      throw new ConvexError({
        code: "CATEGORY_EXISTS",
        message: "A blog category with this name already exists.",
      });
    }

    const baseSlug = slugify(validated.name);
    const slug = await generateUniqueSlug(ctx, "blogCategories", baseSlug, {
      fallbackSlug: "blog-category",
    });

    return await ctx.db.insert("blogCategories", {
      name: validated.name,
      name_ar: validated.nameAr,
      slug,
      color: validated.color.toUpperCase(),
      blog_count: 0,
      createdAt: Date.now(),
    });
  },
});

export const updateBlogCategory = mutation({
  args: {
    id: v.id("blogCategories"),
    name: v.string(),
    nameAr: v.string(),
    color: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...args }) => {
    await requireUser(ctx, { requireTech: true });

    const category = await ctx.db.get("blogCategories", id);
    if (!category || category.deletedAt !== undefined) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Blog category not found.",
      });
    }

    const validated = validateBlogCategoryInput(args);

    const duplicates = await ctx.db
      .query("blogCategories")
      .withIndex("name", (q) => q.eq("name", validated.name))
      .collect();

    if (
      duplicates.some(
        (item) => item._id !== id && item.deletedAt === undefined,
      )
    ) {
      throw new ConvexError({
        code: "CATEGORY_EXISTS",
        message: "A blog category with this name already exists.",
      });
    }

    const baseSlug = slugify(validated.name);
    const slug = await generateUniqueSlug(ctx, "blogCategories", baseSlug, {
      excludeId: id,
      fallbackSlug: "blog-category",
    });

    await ctx.db.patch("blogCategories", id, {
      name: validated.name,
      name_ar: validated.nameAr,
      slug,
      color: validated.color.toUpperCase(),
    });

    return null;
  },
});

export const deleteBlogCategory = mutation({
  args: { id: v.id("blogCategories") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireUser(ctx, { requireTech: true });

    const category = await ctx.db.get("blogCategories", id);
    if (!category || category.deletedAt !== undefined) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Blog category not found.",
      });
    }

    if (category.blog_count > 0) {
      throw new ConvexError({
        code: "CATEGORY_IN_USE",
        message: "Cannot delete a category that still has blogs.",
      });
    }

    await ctx.db.patch("blogCategories", id, {
      deletedAt: Date.now(),
    });

    return null;
  },
});

export const restoreBlogCategory = mutation({
  args: { id: v.id("blogCategories") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireUser(ctx, { requireTech: true });

    const category = await ctx.db.get("blogCategories", id);
    if (!category || category.deletedAt === undefined) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Deleted blog category not found.",
      });
    }

    const existing = await ctx.db
      .query("blogCategories")
      .withIndex("name", (q) => q.eq("name", category.name))
      .first();

    if (existing && existing.deletedAt === undefined && existing._id !== id) {
      throw new ConvexError({
        code: "CATEGORY_EXISTS",
        message: "A blog category with this name already exists.",
      });
    }

    await ctx.db.patch("blogCategories", id, {
      deletedAt: undefined,
    });

    return null;
  },
});
