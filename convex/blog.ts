import { internalQuery, mutation, query } from "./_generated/server";
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
import { generateUniqueSlug, isUsableSlug, slugify } from "./utils/slug";
import { getBlogViewCounts, blogViewCountsValidator } from "./blogViews";

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

function blogBaseSlug(title: string, titleAr: string) {
  return slugify(title) || slugify(titleAr);
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

  // Keep status as-is so an unpublished (draft) post is not re-published on save.
  await ctx.db.patch("blogs", blog._id, {
    hasUnpublishedChanges: true,
    updatedAt: Date.now(),
  });
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

/** Deterministic shuffle so queries stay cache-friendly (no Math.random / Date.now). */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
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
      message:
        "Excerpt is required in both languages before publishing.",
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
  slug: v.optional(v.string()),
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
  slug: v.string(),
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
    slug: blog.slug,
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
    await requireUser(ctx, { requireGodOrTech: true });

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
      slug: v.optional(v.string()),
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
      viewCount: v.number(),
      canPublish: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, { blogId }) => {
    await requireUser(ctx, { requireGodOrTech: true });

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
      slug: blog.slug,
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
      viewCount: blog.view_count ?? 0,
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
    await requireUser(ctx, { requireGodOrTech: true });
    const data = validateCreateInput({
      title: args.title,
      titleAr: args.titleAr,
      categoryId: args.categoryId,
      authorId: args.authorId,
    });

    await getCategoryOrThrow(ctx, args.categoryId);
    await getAuthorOrThrow(ctx, args.authorId);

    const slug = await generateUniqueSlug(ctx, "blogs", blogBaseSlug(data.title, data.titleAr), {
      fallbackSlug: "blog",
    });

    const now = Date.now();
    const blogId = await ctx.db.insert("blogs", {
      title: data.title,
      title_ar: data.titleAr,
      title_search: buildTitleSearch(data.title, data.titleAr),
      slug,
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
    await requireUser(ctx, { requireGodOrTech: true });
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

    // Keep existing slug stable for SEO; regenerate only if missing or unusable
    // (e.g. hyphen-only slugs from Arabic titles).
    let slug = blog.slug;
    if (!isUsableSlug(slug)) {
      slug = await generateUniqueSlug(
        ctx,
        "blogs",
        blogBaseSlug(data.title, data.titleAr),
        {
          excludeId: args.blogId,
          fallbackSlug: "blog",
        },
      );
    }

    await ctx.db.patch("blogs", args.blogId, {
      title: data.title,
      title_ar: data.titleAr,
      title_search: buildTitleSearch(data.title, data.titleAr),
      slug,
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
    await requireUser(ctx, { requireGodOrTech: true });
    const blog = await getBlogOrThrow(ctx, blogId);
    validatePublishable(blog);

    let slug = blog.slug;
    if (!isUsableSlug(slug)) {
      slug = await generateUniqueSlug(
        ctx,
        "blogs",
        blogBaseSlug(blog.title, blog.title_ar),
        {
          excludeId: blogId,
          fallbackSlug: "blog",
        },
      );
    }

    const now = Date.now();
    const snapshot = buildSnapshot(blog);
    const patch: {
      publishedSnapshot: string;
      hasUnpublishedChanges: boolean;
      updatedAt: number;
      status: "published";
      slug: string;
      publishedAt?: number;
    } = {
      publishedSnapshot: snapshot,
      hasUnpublishedChanges: false,
      updatedAt: now,
      status: "published",
      slug,
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
    await requireUser(ctx, { requireGodOrTech: true });
    const blog = await getBlogOrThrow(ctx, blogId);

    if (!blog.publishedSnapshot) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "This blog has never been published.",
      });
    }

    if (blog.status !== "published") {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "This blog is already unpublished.",
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
    await requireUser(ctx, { requireGodOrTech: true });
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
    await requireUser(ctx, { requireGodOrTech: true });
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
    await requireUser(ctx, { requireGodOrTech: true });
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

const publishedBlogDetailValidator = v.object({
  _id: v.id("blogs"),
  title: v.string(),
  title_ar: v.string(),
  slug: v.string(),
  simple_content: v.string(),
  simple_content_ar: v.string(),
  body: v.string(),
  body_ar: v.string(),
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
    description: v.string(),
    description_ar: v.string(),
    profile_thumbnail_url: v.optional(v.string()),
    profile_image_url: v.optional(v.string()),
  }),
  related: v.array(
    v.object({
      _id: v.id("blogs"),
      title: v.string(),
      title_ar: v.string(),
      slug: v.string(),
      thumbnail_image_url: v.optional(v.string()),
      image_url: v.optional(v.string()),
      publishedAt: v.optional(v.number()),
    }),
  ),
});

export const getPublishedBlog = query({
  args: {
    slug: v.string(),
    /** Client-provided seed for related-post shuffle (stable for a page visit). */
    relatedSeed: v.optional(v.number()),
  },
  returns: v.union(publishedBlogDetailValidator, v.null()),
  handler: async (ctx, { slug, relatedSeed }) => {
    // Tech-only while blogs are in preview.
    await requireUser(ctx, { requireGodOrTech: true });

    const blog = await ctx.db
      .query("blogs")
      .withIndex("slug", (q) => q.eq("slug", slug))
      .unique();

    if (
      !blog ||
      blog.deletedAt !== undefined ||
      blog.status !== "published" ||
      !blog.publishedSnapshot ||
      !blog.slug
    ) {
      return null;
    }

    const snapshot = parsePublishedSnapshot(blog.publishedSnapshot);
    if (!snapshot) {
      return null;
    }

    const [category, author] = await Promise.all([
      ctx.db.get("blogCategories", snapshot.category_id),
      ctx.db.get("coaches", snapshot.author_id),
    ]);

    if (!category || category.deletedAt !== undefined || !author || author.deletedAt !== undefined) {
      return null;
    }

    const relatedCandidates = await ctx.db
      .query("blogs")
      .withIndex("by_deletedAt_category_status", (q) =>
        q
          .eq("deletedAt", undefined)
          .eq("category_id", snapshot.category_id)
          .eq("status", "published"),
      )
      .order("desc")
      .take(50);

    const relatedPool: Array<{
      _id: Id<"blogs">;
      title: string;
      title_ar: string;
      slug: string;
      thumbnail_image_url?: string;
      image_url?: string;
      publishedAt?: number;
    }> = [];

    for (const candidate of relatedCandidates) {
      if (
        candidate._id === blog._id ||
        !candidate.publishedSnapshot ||
        !candidate.slug
      ) {
        continue;
      }
      const relatedSnapshot = parsePublishedSnapshot(candidate.publishedSnapshot);
      if (!relatedSnapshot) {
        continue;
      }
      relatedPool.push({
        _id: candidate._id,
        title: relatedSnapshot.title,
        title_ar: relatedSnapshot.title_ar,
        slug: candidate.slug,
        thumbnail_image_url: relatedSnapshot.thumbnail_image_url,
        image_url: relatedSnapshot.image_url,
        publishedAt: candidate.publishedAt,
      });
    }

    const seed =
      relatedSeed !== undefined && Number.isFinite(relatedSeed)
        ? Math.abs(Math.floor(relatedSeed))
        : blog._creationTime;
    const related = seededShuffle(relatedPool, seed).slice(0, 5);

    return {
      _id: blog._id,
      title: snapshot.title,
      title_ar: snapshot.title_ar,
      slug: blog.slug,
      simple_content: snapshot.simple_content,
      simple_content_ar: snapshot.simple_content_ar,
      body: snapshot.body,
      body_ar: snapshot.body_ar,
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
        description: author.description,
        description_ar: author.description_ar,
        profile_thumbnail_url: author.profile_thumbnail_url,
        profile_image_url: author.profile_image_url,
      },
      related,
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
    await requireUser(ctx, { requireGodOrTech: true });

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
      slug: string;
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
      if (!blog.publishedSnapshot || !blog.slug) {
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
        slug: blog.slug,
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
    await requireUser(ctx, { requireGodOrTech: true });

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

const landingBlogCardValidator = v.object({
  id: v.id("blogs"),
  slug: v.string(),
  titleEn: v.string(),
  titleAr: v.string(),
  excerptEn: v.string(),
  excerptAr: v.string(),
  thumbnailImageUrl: v.union(v.string(), v.null()),
  imageUrl: v.union(v.string(), v.null()),
  readingTimeMinutes: v.number(),
  publishedAt: v.union(v.number(), v.null()),
  viewCount: v.number(),
  category: v.object({
    id: v.id("blogCategories"),
    nameEn: v.string(),
    nameAr: v.string(),
    color: v.string(),
  }),
  author: v.object({
    id: v.id("coaches"),
    nameEn: v.string(),
    nameAr: v.string(),
    profileThumbnailUrl: v.union(v.string(), v.null()),
    profileImageUrl: v.union(v.string(), v.null()),
  }),
});

const landingBlogDetailValidator = v.object({
  id: v.id("blogs"),
  slug: v.string(),
  titleEn: v.string(),
  titleAr: v.string(),
  excerptEn: v.string(),
  excerptAr: v.string(),
  bodyEn: v.string(),
  bodyAr: v.string(),
  thumbnailImageUrl: v.union(v.string(), v.null()),
  imageUrl: v.union(v.string(), v.null()),
  readingTimeMinutes: v.number(),
  publishedAt: v.union(v.number(), v.null()),
  views: blogViewCountsValidator,
  category: v.object({
    id: v.id("blogCategories"),
    nameEn: v.string(),
    nameAr: v.string(),
    color: v.string(),
  }),
  author: v.object({
    id: v.id("coaches"),
    nameEn: v.string(),
    nameAr: v.string(),
    descriptionEn: v.string(),
    descriptionAr: v.string(),
    profileThumbnailUrl: v.union(v.string(), v.null()),
    profileImageUrl: v.union(v.string(), v.null()),
  }),
  related: v.array(
    v.object({
      id: v.id("blogs"),
      slug: v.string(),
      titleEn: v.string(),
      titleAr: v.string(),
      thumbnailImageUrl: v.union(v.string(), v.null()),
      imageUrl: v.union(v.string(), v.null()),
      publishedAt: v.union(v.number(), v.null()),
      viewCount: v.number(),
    }),
  ),
});

type LandingBlogCard = {
  id: Id<"blogs">;
  slug: string;
  titleEn: string;
  titleAr: string;
  excerptEn: string;
  excerptAr: string;
  thumbnailImageUrl: string | null;
  imageUrl: string | null;
  readingTimeMinutes: number;
  publishedAt: number | null;
  viewCount: number;
  category: {
    id: Id<"blogCategories">;
    nameEn: string;
    nameAr: string;
    color: string;
  };
  author: {
    id: Id<"coaches">;
    nameEn: string;
    nameAr: string;
    profileThumbnailUrl: string | null;
    profileImageUrl: string | null;
  };
};

async function toLandingBlogCard(
  ctx: QueryCtx,
  blog: Doc<"blogs">,
): Promise<LandingBlogCard | null> {
  if (!blog.publishedSnapshot || !blog.slug) {
    return null;
  }
  const snapshot = parsePublishedSnapshot(blog.publishedSnapshot);
  if (!snapshot) {
    return null;
  }

  const [category, author] = await Promise.all([
    ctx.db.get("blogCategories", snapshot.category_id),
    ctx.db.get("coaches", snapshot.author_id),
  ]);

  if (
    !category ||
    category.deletedAt !== undefined ||
    !author ||
    author.deletedAt !== undefined
  ) {
    return null;
  }

  return {
    id: blog._id,
    slug: blog.slug,
    titleEn: snapshot.title,
    titleAr: snapshot.title_ar,
    excerptEn: snapshot.simple_content,
    excerptAr: snapshot.simple_content_ar,
    thumbnailImageUrl: snapshot.thumbnail_image_url ?? null,
    imageUrl: snapshot.image_url ?? null,
    readingTimeMinutes: snapshot.reading_time_minutes,
    publishedAt: blog.publishedAt ?? null,
    viewCount: blog.view_count ?? 0,
    category: {
      id: category._id,
      nameEn: category.name,
      nameAr: category.name_ar,
      color: category.color,
    },
    author: {
      id: author._id,
      nameEn: author.name,
      nameAr: author.name_ar,
      profileThumbnailUrl: author.profile_thumbnail_url ?? null,
      profileImageUrl: author.profile_image_url ?? null,
    },
  };
}

/** Public landing API: published blogs (no Convex auth; gated by LANDING_SECRET in HTTP). */
export const listLandingBlogs = internalQuery({
  args: {
    limit: v.optional(v.number()),
    categoryId: v.optional(v.id("blogCategories")),
  },
  returns: v.array(landingBlogCardValidator),
  handler: async (ctx, args): Promise<Array<LandingBlogCard>> => {
    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? 200), 1),
      200,
    );
    const categoryId = args.categoryId;

    const blogs =
      categoryId !== undefined
        ? await ctx.db
            .query("blogs")
            .withIndex("by_deletedAt_category_status", (q) =>
              q
                .eq("deletedAt", undefined)
                .eq("category_id", categoryId)
                .eq("status", "published"),
            )
            .order("desc")
            .take(limit)
        : await ctx.db
            .query("blogs")
            .withIndex("by_deletedAt_status", (q) =>
              q.eq("deletedAt", undefined).eq("status", "published"),
            )
            .order("desc")
            .take(limit);

    const page: Array<LandingBlogCard> = [];
    for (const blog of blogs) {
      const card = await toLandingBlogCard(ctx, blog);
      if (card) {
        page.push(card);
      }
    }
    return page;
  },
});

/** Public landing API: published blog detail by slug. */
export const getLandingBlogBySlug = internalQuery({
  args: {
    slug: v.string(),
    relatedSeed: v.optional(v.number()),
    /** Client/HTTP-provided instant for current day/week/month buckets. */
    atMs: v.number(),
  },
  returns: v.union(landingBlogDetailValidator, v.null()),
  handler: async (ctx, { slug, relatedSeed, atMs }) => {
    const blog = await ctx.db
      .query("blogs")
      .withIndex("slug", (q) => q.eq("slug", slug))
      .unique();

    if (
      !blog ||
      blog.deletedAt !== undefined ||
      blog.status !== "published" ||
      !blog.publishedSnapshot ||
      !blog.slug
    ) {
      return null;
    }

    const snapshot = parsePublishedSnapshot(blog.publishedSnapshot);
    if (!snapshot) {
      return null;
    }

    const [category, author, views] = await Promise.all([
      ctx.db.get("blogCategories", snapshot.category_id),
      ctx.db.get("coaches", snapshot.author_id),
      getBlogViewCounts(ctx, blog._id, atMs),
    ]);

    if (
      !category ||
      category.deletedAt !== undefined ||
      !author ||
      author.deletedAt !== undefined
    ) {
      return null;
    }

    const relatedCandidates = await ctx.db
      .query("blogs")
      .withIndex("by_deletedAt_category_status", (q) =>
        q
          .eq("deletedAt", undefined)
          .eq("category_id", snapshot.category_id)
          .eq("status", "published"),
      )
      .order("desc")
      .take(50);

    const relatedPool: Array<{
      id: Id<"blogs">;
      slug: string;
      titleEn: string;
      titleAr: string;
      thumbnailImageUrl: string | null;
      imageUrl: string | null;
      publishedAt: number | null;
      viewCount: number;
    }> = [];

    for (const candidate of relatedCandidates) {
      if (
        candidate._id === blog._id ||
        !candidate.publishedSnapshot ||
        !candidate.slug
      ) {
        continue;
      }
      const relatedSnapshot = parsePublishedSnapshot(candidate.publishedSnapshot);
      if (!relatedSnapshot) {
        continue;
      }
      relatedPool.push({
        id: candidate._id,
        slug: candidate.slug,
        titleEn: relatedSnapshot.title,
        titleAr: relatedSnapshot.title_ar,
        thumbnailImageUrl: relatedSnapshot.thumbnail_image_url ?? null,
        imageUrl: relatedSnapshot.image_url ?? null,
        publishedAt: candidate.publishedAt ?? null,
        viewCount: candidate.view_count ?? 0,
      });
    }

    const seed =
      relatedSeed !== undefined && Number.isFinite(relatedSeed)
        ? Math.abs(Math.floor(relatedSeed))
        : blog._creationTime;
    const related = seededShuffle(relatedPool, seed).slice(0, 5);

    return {
      id: blog._id,
      slug: blog.slug,
      titleEn: snapshot.title,
      titleAr: snapshot.title_ar,
      excerptEn: snapshot.simple_content,
      excerptAr: snapshot.simple_content_ar,
      bodyEn: snapshot.body,
      bodyAr: snapshot.body_ar,
      thumbnailImageUrl: snapshot.thumbnail_image_url ?? null,
      imageUrl: snapshot.image_url ?? null,
      readingTimeMinutes: snapshot.reading_time_minutes,
      publishedAt: blog.publishedAt ?? null,
      views,
      category: {
        id: category._id,
        nameEn: category.name,
        nameAr: category.name_ar,
        color: category.color,
      },
      author: {
        id: author._id,
        nameEn: author.name,
        nameAr: author.name_ar,
        descriptionEn: author.description,
        descriptionAr: author.description_ar,
        profileThumbnailUrl: author.profile_thumbnail_url ?? null,
        profileImageUrl: author.profile_image_url ?? null,
      },
      related,
    };
  },
});
