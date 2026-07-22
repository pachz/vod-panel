import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

import {
  blogCreateSchema,
  blogUpdateSchema,
  type BlogCreateInput,
  type BlogUpdateInput,
} from "../shared/validation/blog";
import { requireUser } from "./utils/auth";

type BlogSnapshot = {
  title: string;
  title_ar: string;
  simple_content: string;
  simple_content_ar: string;
  body: string;
  body_ar: string;
  category_id: Id<"blogCategories">;
  author_id: Id<"coaches">;
  image_url?: string;
  thumbnail_image_url?: string;
  reading_time_minutes: number;
};

function buildTitleSearch(title: string, titleAr: string) {
  return `${title} ${titleAr}`.trim();
}

function validateCreateInput(input: BlogCreateInput) {
  const result = blogCreateSchema.safeParse(input);
  if (!result.success) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: result.error.errors[0]?.message ?? "Invalid blog input.",
    });
  }
  return result.data;
}

function validateUpdateInput(input: BlogUpdateInput) {
  const result = blogUpdateSchema.safeParse(input);
  if (!result.success) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: result.error.errors[0]?.message ?? "Invalid blog input.",
    });
  }
  return result.data;
}

async function getBlogOrThrow(ctx: QueryCtx | MutationCtx, blogId: Id<"blogs">) {
  const blog = await ctx.db.get("blogs", blogId);
  if (!blog || blog.deletedAt !== undefined) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Blog not found.",
    });
  }
  return blog;
}

async function getCategoryOrThrow(
  ctx: QueryCtx | MutationCtx,
  categoryId: Id<"blogCategories">,
) {
  const category = await ctx.db.get("blogCategories", categoryId);
  if (!category || category.deletedAt !== undefined) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Blog category not found.",
    });
  }
  return category;
}

async function getAuthorOrThrow(
  ctx: QueryCtx | MutationCtx,
  authorId: Id<"coaches">,
) {
  const author = await ctx.db.get("coaches", authorId);
  if (!author || author.deletedAt !== undefined) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Author (coach) not found.",
    });
  }
  return author;
}

async function adjustBlogCount(
  ctx: MutationCtx,
  categoryId: Id<"blogCategories">,
  delta: number,
) {
  const category = await ctx.db.get("blogCategories", categoryId);
  if (!category) {
    return;
  }
  await ctx.db.patch("blogCategories", categoryId, {
    blog_count: Math.max(category.blog_count + delta, 0),
  });
}

async function markUnpublishedChanges(ctx: MutationCtx, blog: Doc<"blogs">) {
  if (blog.publishedSnapshot === undefined) {
    return;
  }

  const patch: {
    hasUnpublishedChanges: boolean;
    updatedAt: number;
    status?: "published";
  } = {
    hasUnpublishedChanges: true,
    updatedAt: Date.now(),
  };

  if (blog.status === "draft") {
    patch.status = "published";
  }

  await ctx.db.patch("blogs", blog._id, patch);
}

function resolveHasUnpublishedChanges(blog: Doc<"blogs">) {
  return (
    blog.hasUnpublishedChanges === true ||
    (blog.status === "draft" && blog.publishedSnapshot !== undefined)
  );
}

function buildSnapshot(blog: Doc<"blogs">): string {
  const snapshot: BlogSnapshot = {
    title: blog.title,
    title_ar: blog.title_ar,
    simple_content: blog.simple_content,
    simple_content_ar: blog.simple_content_ar,
    body: blog.body,
    body_ar: blog.body_ar,
    category_id: blog.category_id,
    author_id: blog.author_id,
    image_url: blog.image_url,
    thumbnail_image_url: blog.thumbnail_image_url,
    reading_time_minutes: blog.reading_time_minutes,
  };
  return JSON.stringify(snapshot);
}

function parsePublishedSnapshot(raw: string): BlogSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as BlogSnapshot;
    if (
      typeof parsed.title !== "string" ||
      typeof parsed.title_ar !== "string" ||
      typeof parsed.simple_content !== "string" ||
      typeof parsed.simple_content_ar !== "string" ||
      typeof parsed.body !== "string" ||
      typeof parsed.body_ar !== "string" ||
      typeof parsed.category_id !== "string" ||
      typeof parsed.author_id !== "string" ||
      typeof parsed.reading_time_minutes !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function validatePublishable(blog: Doc<"blogs">) {
  if (!blog.title.trim() || !blog.title_ar.trim()) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Title is required in both languages before publishing.",
    });
  }
  if (!blog.simple_content.trim() || !blog.simple_content_ar.trim()) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Simple content is required in both languages before publishing.",
    });
  }
  if (!blog.body.trim() || !blog.body_ar.trim()) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Full content is required in both languages before publishing.",
    });
  }
  if (!blog.thumbnail_image_url && !blog.image_url) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Add an image before publishing.",
    });
  }
}

const blogListItemValidator = v.object({
  _id: v.id("blogs"),
  _creationTime: v.number(),
  title: v.string(),
  title_ar: v.string(),
  status: v.union(v.literal("draft"), v.literal("published")),
  category_id: v.id("blogCategories"),
  categoryName: v.string(),
  categoryNameAr: v.string(),
  categoryColor: v.string(),
  author_id: v.id("coaches"),
  authorName: v.string(),
  reading_time_minutes: v.number(),
  thumbnail_image_url: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  publishedAt: v.optional(v.number()),
  hasPublishedSnapshot: v.boolean(),
  hasUnpublishedChanges: v.boolean(),
});

const publishedBlogCardValidator = v.object({
  _id: v.id("blogs"),
  title: v.string(),
  title_ar: v.string(),
  simple_content: v.string(),
  simple_content_ar: v.string(),
  thumbnail_image_url: v.optional(v.string()),
  image_url: v.optional(v.string()),
  reading_time_minutes: v.number(),
  publishedAt: v.optional(v.number()),
  category: v.object({
    _id: v.id("blogCategories"),
    name: v.string(),
    name_ar: v.string(),
    color: v.string(),
  }),
  author: v.object({
    _id: v.id("coaches"),
    name: v.string(),
    name_ar: v.string(),
    profile_thumbnail_url: v.optional(v.string()),
    profile_image_url: v.optional(v.string()),
  }),
});

async function enrichAdminListItem(
  ctx: QueryCtx,
  blog: Doc<"blogs">,
) {
  const [category, author] = await Promise.all([
    ctx.db.get("blogCategories", blog.category_id),
    ctx.db.get("coaches", blog.author_id),
  ]);

  return {
    _id: blog._id,
    _creationTime: blog._creationTime,
    title: blog.title,
    title_ar: blog.title_ar,
    status: blog.status,
    category_id: blog.category_id,
    categoryName: category?.name ?? "Unknown",
    categoryNameAr: category?.name_ar ?? "Unknown",
    categoryColor: category?.color ?? "#888888",
    author_id: blog.author_id,
    authorName: author?.name ?? "Unknown",
    reading_time_minutes: blog.reading_time_minutes,
    thumbnail_image_url: blog.thumbnail_image_url,
    createdAt: blog.createdAt,
    updatedAt: blog.updatedAt,
    publishedAt: blog.publishedAt,
    hasPublishedSnapshot: blog.publishedSnapshot !== undefined,
    hasUnpublishedChanges: resolveHasUnpublishedChanges(blog),
  };
}

export const listBlogs = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
    categoryId: v.optional(v.id("blogCategories")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    page: v.array(blogListItemValidator),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { search, status, categoryId, limit = 12, cursor }) => {
    await requireUser(ctx, { requireTech: true });

    const numItems = Math.min(Math.max(limit, 1), 100);

    if (search && search.trim().length > 0) {
      const results = await ctx.db
        .query("blogs")
        .withSearchIndex("search_title", (q) => {
          let queryBuilder = q
            .search("title_search", search.trim())
            .eq("deletedAt", undefined);
          if (status) {
            queryBuilder = queryBuilder.eq("status", status);
          }
          if (categoryId) {
            queryBuilder = queryBuilder.eq("category_id", categoryId);
          }
          return queryBuilder;
        })
        .paginate({ cursor: cursor ?? null, numItems });

      return {
        page: await Promise.all(
          results.page.map((blog) => enrichAdminListItem(ctx, blog)),
        ),
        isDone: results.isDone,
        continueCursor: results.continueCursor,
      };
    }

    let results;
    if (categoryId !== undefined && status !== undefined) {
      results = await ctx.db
        .query("blogs")
        .withIndex("by_deletedAt_category_status", (q) =>
          q
            .eq("deletedAt", undefined)
            .eq("category_id", categoryId)
            .eq("status", status),
        )
        .order("desc")
        .paginate({ cursor: cursor ?? null, numItems });
    } else if (categoryId !== undefined) {
      results = await ctx.db
        .query("blogs")
        .withIndex("by_deletedAt_category", (q) =>
          q.eq("deletedAt", undefined).eq("category_id", categoryId),
        )
        .order("desc")
        .paginate({ cursor: cursor ?? null, numItems });
    } else if (status !== undefined) {
      results = await ctx.db
        .query("blogs")
        .withIndex("by_deletedAt_status", (q) =>
          q.eq("deletedAt", undefined).eq("status", status),
        )
        .order("desc")
        .paginate({ cursor: cursor ?? null, numItems });
    } else {
      results = await ctx.db
        .query("blogs")
        .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
        .order("desc")
        .paginate({ cursor: cursor ?? null, numItems });
    }

    return {
      page: await Promise.all(
        results.page.map((blog) => enrichAdminListItem(ctx, blog)),
      ),
      isDone: results.isDone,
      continueCursor: results.continueCursor,
    };
  },
});

export const getBlog = query({
  args: { blogId: v.id("blogs") },
  returns: v.union(
    v.object({
      _id: v.id("blogs"),
      _creationTime: v.number(),
      title: v.string(),
      title_ar: v.string(),
      simple_content: v.string(),
      simple_content_ar: v.string(),
      body: v.string(),
      body_ar: v.string(),
      category_id: v.id("blogCategories"),
      author_id: v.id("coaches"),
      image_url: v.optional(v.string()),
      thumbnail_image_url: v.optional(v.string()),
      reading_time_minutes: v.number(),
      status: v.union(v.literal("draft"), v.literal("published")),
      publishedSnapshot: v.optional(v.string()),
      hasUnpublishedChanges: v.boolean(),
      publishedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
      canPublish: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, { blogId }) => {
    await requireUser(ctx, { requireTech: true });

    const blog = await ctx.db.get("blogs", blogId);
    if (!blog || blog.deletedAt !== undefined) {
      return null;
    }

    const canPublish =
      blog.title.trim().length > 0 &&
      blog.title_ar.trim().length > 0 &&
      blog.simple_content.trim().length > 0 &&
      blog.simple_content_ar.trim().length > 0 &&
      blog.body.trim().length > 0 &&
      blog.body_ar.trim().length > 0 &&
      Boolean(blog.thumbnail_image_url || blog.image_url);

    return {
      _id: blog._id,
      _creationTime: blog._creationTime,
      title: blog.title,
      title_ar: blog.title_ar,
      simple_content: blog.simple_content,
      simple_content_ar: blog.simple_content_ar,
      body: blog.body,
      body_ar: blog.body_ar,
      category_id: blog.category_id,
      author_id: blog.author_id,
      image_url: blog.image_url,
      thumbnail_image_url: blog.thumbnail_image_url,
      reading_time_minutes: blog.reading_time_minutes,
      status: blog.status,
      publishedSnapshot: blog.publishedSnapshot,
      hasUnpublishedChanges: resolveHasUnpublishedChanges(blog),
      publishedAt: blog.publishedAt,
      createdAt: blog.createdAt,
      updatedAt: blog.updatedAt,
      canPublish,
    };
  },
});

export const createBlog = mutation({
  args: {
    title: v.string(),
    titleAr: v.string(),
    categoryId: v.id("blogCategories"),
    authorId: v.id("coaches"),
  },
  returns: v.id("blogs"),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });
    const data = validateCreateInput({
      title: args.title,
      titleAr: args.titleAr,
      categoryId: args.categoryId,
      authorId: args.authorId,
    });

    await getCategoryOrThrow(ctx, args.categoryId);
    await getAuthorOrThrow(ctx, args.authorId);

    const now = Date.now();
    const blogId = await ctx.db.insert("blogs", {
      title: data.title,
      title_ar: data.titleAr,
      title_search: buildTitleSearch(data.title, data.titleAr),
      simple_content: "",
      simple_content_ar: "",
      body: "",
      body_ar: "",
      category_id: args.categoryId,
      author_id: args.authorId,
      reading_time_minutes: 5,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    await adjustBlogCount(ctx, args.categoryId, 1);

    return blogId;
  },
});

export const updateBlog = mutation({
  args: {
    blogId: v.id("blogs"),
    title: v.string(),
    titleAr: v.string(),
    simpleContent: v.string(),
    simpleContentAr: v.string(),
    body: v.string(),
    bodyAr: v.string(),
    categoryId: v.id("blogCategories"),
    authorId: v.id("coaches"),
    readingTimeMinutes: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });
    const blog = await getBlogOrThrow(ctx, args.blogId);
    const data = validateUpdateInput({
      title: args.title,
      titleAr: args.titleAr,
      simpleContent: args.simpleContent,
      simpleContentAr: args.simpleContentAr,
      body: args.body,
      bodyAr: args.bodyAr,
      categoryId: args.categoryId,
      authorId: args.authorId,
      readingTimeMinutes: args.readingTimeMinutes,
    });

    await getCategoryOrThrow(ctx, args.categoryId);
    await getAuthorOrThrow(ctx, args.authorId);

    if (blog.category_id !== args.categoryId) {
      await adjustBlogCount(ctx, blog.category_id, -1);
      await adjustBlogCount(ctx, args.categoryId, 1);
    }

    await markUnpublishedChanges(ctx, blog);

    await ctx.db.patch("blogs", args.blogId, {
      title: data.title,
      title_ar: data.titleAr,
      title_search: buildTitleSearch(data.title, data.titleAr),
      simple_content: data.simpleContent,
      simple_content_ar: data.simpleContentAr,
      body: data.body,
      body_ar: data.bodyAr,
      category_id: args.categoryId,
      author_id: args.authorId,
      reading_time_minutes: data.readingTimeMinutes,
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const publishBlog = mutation({
  args: { blogId: v.id("blogs") },
  returns: v.null(),
  handler: async (ctx, { blogId }) => {
    await requireUser(ctx, { requireTech: true });
    const blog = await getBlogOrThrow(ctx, blogId);
    validatePublishable(blog);

    const now = Date.now();
    const snapshot = buildSnapshot(blog);
    const patch: {
      publishedSnapshot: string;
      hasUnpublishedChanges: boolean;
      updatedAt: number;
      status: "published";
      publishedAt?: number;
    } = {
      publishedSnapshot: snapshot,
      hasUnpublishedChanges: false,
      updatedAt: now,
      status: "published",
    };

    if (blog.publishedAt === undefined) {
      patch.publishedAt = now;
    }

    await ctx.db.patch("blogs", blogId, patch);
    return null;
  },
});

export const unpublishBlog = mutation({
  args: { blogId: v.id("blogs") },
  returns: v.null(),
  handler: async (ctx, { blogId }) => {
    await requireUser(ctx, { requireTech: true });
    const blog = await getBlogOrThrow(ctx, blogId);

    if (!blog.publishedSnapshot) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "This blog has never been published.",
      });
    }

    await ctx.db.patch("blogs", blogId, {
      status: "draft",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const deleteBlog = mutation({
  args: { blogId: v.id("blogs") },
  returns: v.null(),
  handler: async (ctx, { blogId }) => {
    await requireUser(ctx, { requireTech: true });
    const blog = await getBlogOrThrow(ctx, blogId);

    await adjustBlogCount(ctx, blog.category_id, -1);

    await ctx.db.patch("blogs", blogId, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const generateBlogImageUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx, { requireTech: true });
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateBlogImages = mutation({
  args: {
    blogId: v.id("blogs"),
    imageStorageId: v.id("_storage"),
    thumbnailStorageId: v.optional(v.id("_storage")),
  },
  returns: v.object({
    imageUrl: v.string(),
    thumbnailImageUrl: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });
    const blog = await getBlogOrThrow(ctx, args.blogId);

    const imageUrl = await ctx.storage.getUrl(args.imageStorageId);
    if (!imageUrl) {
      throw new ConvexError({
        code: "STORAGE_ERROR",
        message: "Could not generate image URL.",
      });
    }

    let thumbnailImageUrl: string | undefined;
    if (args.thumbnailStorageId) {
      const url = await ctx.storage.getUrl(args.thumbnailStorageId);
      if (!url) {
        throw new ConvexError({
          code: "STORAGE_ERROR",
          message: "Could not generate thumbnail image URL.",
        });
      }
      thumbnailImageUrl = url;
    }

    await markUnpublishedChanges(ctx, blog);

    await ctx.db.patch("blogs", args.blogId, {
      image_url: imageUrl,
      thumbnail_image_url: thumbnailImageUrl ?? imageUrl,
      updatedAt: Date.now(),
    });

    return {
      imageUrl,
      thumbnailImageUrl: thumbnailImageUrl ?? imageUrl,
    };
  },
});

export const listPublishedBlogs = query({
  args: {
    search: v.optional(v.string()),
    categoryId: v.optional(v.id("blogCategories")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    page: v.array(publishedBlogCardValidator),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { search, categoryId, limit = 12, cursor }) => {
    // Tech-only while blogs are in preview.
    await requireUser(ctx, { requireTech: true });

    const numItems = Math.min(Math.max(limit, 1), 100);

    let results;
    if (search && search.trim().length > 0) {
      results = await ctx.db
        .query("blogs")
        .withSearchIndex("search_title", (q) => {
          let queryBuilder = q
            .search("title_search", search.trim())
            .eq("deletedAt", undefined)
            .eq("status", "published");
          if (categoryId) {
            queryBuilder = queryBuilder.eq("category_id", categoryId);
          }
          return queryBuilder;
        })
        .paginate({ cursor: cursor ?? null, numItems });
    } else if (categoryId !== undefined) {
      results = await ctx.db
        .query("blogs")
        .withIndex("by_deletedAt_category_status", (q) =>
          q
            .eq("deletedAt", undefined)
            .eq("category_id", categoryId)
            .eq("status", "published"),
        )
        .order("desc")
        .paginate({ cursor: cursor ?? null, numItems });
    } else {
      results = await ctx.db
        .query("blogs")
        .withIndex("by_deletedAt_status", (q) =>
          q.eq("deletedAt", undefined).eq("status", "published"),
        )
        .order("desc")
        .paginate({ cursor: cursor ?? null, numItems });
    }

    const page: Array<{
      _id: Id<"blogs">;
      title: string;
      title_ar: string;
      simple_content: string;
      simple_content_ar: string;
      thumbnail_image_url?: string;
      image_url?: string;
      reading_time_minutes: number;
      publishedAt?: number;
      category: {
        _id: Id<"blogCategories">;
        name: string;
        name_ar: string;
        color: string;
      };
      author: {
        _id: Id<"coaches">;
        name: string;
        name_ar: string;
        profile_thumbnail_url?: string;
        profile_image_url?: string;
      };
    }> = [];

    for (const blog of results.page) {
      if (!blog.publishedSnapshot) {
        continue;
      }
      const snapshot = parsePublishedSnapshot(blog.publishedSnapshot);
      if (!snapshot) {
        continue;
      }

      const [category, author] = await Promise.all([
        ctx.db.get("blogCategories", snapshot.category_id),
        ctx.db.get("coaches", snapshot.author_id),
      ]);

      if (!category || category.deletedAt !== undefined || !author) {
        continue;
      }

      page.push({
        _id: blog._id,
        title: snapshot.title,
        title_ar: snapshot.title_ar,
        simple_content: snapshot.simple_content,
        simple_content_ar: snapshot.simple_content_ar,
        thumbnail_image_url: snapshot.thumbnail_image_url,
        image_url: snapshot.image_url,
        reading_time_minutes: snapshot.reading_time_minutes,
        publishedAt: blog.publishedAt,
        category: {
          _id: category._id,
          name: category.name,
          name_ar: category.name_ar,
          color: category.color,
        },
        author: {
          _id: author._id,
          name: author.name,
          name_ar: author.name_ar,
          profile_thumbnail_url: author.profile_thumbnail_url,
          profile_image_url: author.profile_image_url,
        },
      });
    }

    return {
      page,
      isDone: results.isDone,
      continueCursor: results.continueCursor,
    };
  },
});

export const listPublishedBlogCategoryIds = query({
  args: {},
  returns: v.array(v.id("blogCategories")),
  handler: async (ctx) => {
    await requireUser(ctx, { requireTech: true });

    const blogs = await ctx.db
      .query("blogs")
      .withIndex("by_deletedAt_status", (q) =>
        q.eq("deletedAt", undefined).eq("status", "published"),
      )
      .take(500);

    const ids = new Set<Id<"blogCategories">>();
    for (const blog of blogs) {
      if (!blog.publishedSnapshot) continue;
      const snapshot = parsePublishedSnapshot(blog.publishedSnapshot);
      if (snapshot) {
        ids.add(snapshot.category_id);
      }
    }
    return Array.from(ids);
  },
});
