import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export type BlogViewGranularity = "total" | "day" | "week" | "month";

export type BlogViewCounts = {
  total: number;
  day: number;
  week: number;
  month: number;
};

export const blogViewCountsValidator = v.object({
  total: v.number(),
  day: v.number(),
  week: v.number(),
  month: v.number(),
});

/** UTC calendar day: YYYY-MM-DD */
export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** UTC calendar month: YYYY-MM */
export function utcMonthKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

/**
 * ISO week key in UTC: YYYY-Www (week-year may differ from calendar year).
 */
export function utcIsoWeekKey(ms: number): string {
  const date = new Date(ms);
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // ISO: week belongs to the year of its Thursday
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const isoYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function periodKeysAt(ms: number): Array<{
  granularity: BlogViewGranularity;
  periodKey: string;
}> {
  return [
    { granularity: "total", periodKey: "all" },
    { granularity: "day", periodKey: utcDayKey(ms) },
    { granularity: "week", periodKey: utcIsoWeekKey(ms) },
    { granularity: "month", periodKey: utcMonthKey(ms) },
  ];
}

async function incrementBucket(
  ctx: MutationCtx,
  blogId: Id<"blogs">,
  granularity: BlogViewGranularity,
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
  granularity: BlogViewGranularity,
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
): Promise<BlogViewCounts> {
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
    const counts: Partial<Record<BlogViewGranularity, number>> = {};

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
