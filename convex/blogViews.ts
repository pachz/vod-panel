import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  periodKeysAt,
  utcDayKey,
  utcIsoWeekKey,
  utcMonthKey,
  viewCountsValidator,
  type ViewCounts,
  type ViewGranularity,
} from "./lib/viewPeriodKeys";

/** @deprecated Prefer ViewGranularity from lib/viewPeriodKeys */
export type BlogViewGranularity = ViewGranularity;

/** @deprecated Prefer ViewCounts from lib/viewPeriodKeys */
export type BlogViewCounts = ViewCounts;

export const blogViewCountsValidator = viewCountsValidator;

export { utcDayKey, utcMonthKey, utcIsoWeekKey };

async function incrementBucket(
  ctx: MutationCtx,
  blogId: Id<"blogs">,
  granularity: ViewGranularity,
  periodKey: string,
  now: number,
): Promise<number> {
  const existing = await ctx.db
    .query("blogViewBuckets")
    .withIndex("by_blog_granularity_period", (q) =>
      q
        .eq("blogId", blogId)
        .eq("granularity", granularity)
        .eq("periodKey", periodKey),
    )
    .unique();

  if (existing) {
    const next = existing.count + 1;
    await ctx.db.patch(existing._id, { count: next, updatedAt: now });
    return next;
  }

  await ctx.db.insert("blogViewBuckets", {
    blogId,
    granularity,
    periodKey,
    count: 1,
    updatedAt: now,
  });
  return 1;
}

async function readBucketCount(
  ctx: QueryCtx | MutationCtx,
  blogId: Id<"blogs">,
  granularity: ViewGranularity,
  periodKey: string,
): Promise<number> {
  const row = await ctx.db
    .query("blogViewBuckets")
    .withIndex("by_blog_granularity_period", (q) =>
      q
        .eq("blogId", blogId)
        .eq("granularity", granularity)
        .eq("periodKey", periodKey),
    )
    .unique();
  return row?.count ?? 0;
}

/** Read total + current day/week/month buckets. `atMs` selects which periods are "current". */
export async function getBlogViewCounts(
  ctx: QueryCtx | MutationCtx,
  blogId: Id<"blogs">,
  atMs: number,
): Promise<ViewCounts> {
  const keys = periodKeysAt(atMs);
  const [total, day, week, month] = await Promise.all(
    keys.map(({ granularity, periodKey }) =>
      readBucketCount(ctx, blogId, granularity, periodKey),
    ),
  );
  return {
    total: total ?? 0,
    day: day ?? 0,
    week: week ?? 0,
    month: month ?? 0,
  };
}

/** Record one view: increments total + current day/week/month buckets (UTC). */
export const recordBlogViewBySlug = internalMutation({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      blogId: v.id("blogs"),
      slug: v.string(),
      views: blogViewCountsValidator,
    }),
  ),
  handler: async (ctx, { slug }) => {
    const blog = await ctx.db
      .query("blogs")
      .withIndex("slug", (q) => q.eq("slug", slug))
      .unique();

    if (
      !blog ||
      blog.deletedAt !== undefined ||
      blog.status !== "published" ||
      !blog.slug
    ) {
      return null;
    }

    const now = Date.now();
    const keys = periodKeysAt(now);
    const counts: Partial<Record<ViewGranularity, number>> = {};

    for (const { granularity, periodKey } of keys) {
      counts[granularity] = await incrementBucket(
        ctx,
        blog._id,
        granularity,
        periodKey,
        now,
      );
    }

    const total = counts.total ?? 0;
    await ctx.db.patch(blog._id, { view_count: total });

    return {
      blogId: blog._id,
      slug: blog.slug,
      views: {
        total,
        day: counts.day ?? 0,
        week: counts.week ?? 0,
        month: counts.month ?? 0,
      },
    };
  },
});

export const getBlogViewCountsById = internalQuery({
  args: {
    blogId: v.id("blogs"),
    atMs: v.number(),
  },
  returns: blogViewCountsValidator,
  handler: async (ctx, { blogId, atMs }) => {
    return await getBlogViewCounts(ctx, blogId, atMs);
  },
});

export const getBlogViewCountsBySlug = internalQuery({
  args: {
    slug: v.string(),
    atMs: v.number(),
  },
  returns: v.union(blogViewCountsValidator, v.null()),
  handler: async (ctx, { slug, atMs }) => {
    const blog = await ctx.db
      .query("blogs")
      .withIndex("slug", (q) => q.eq("slug", slug))
      .unique();

    if (!blog || blog.deletedAt !== undefined) {
      return null;
    }

    return await getBlogViewCounts(ctx, blog._id, atMs);
  },
});
