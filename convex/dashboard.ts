import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./utils/auth";

export const getDashboardStats = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx, { requireGod: true });

    // Get total categories (non-deleted)
    const allCategories = await ctx.db.query("categories").collect();
    const totalCategories = allCategories.filter((c) => c.deletedAt === undefined).length;

    // Get active courses (published, non-deleted)
    const allCourses = await ctx.db
      .query("courses")
      .withIndex("deletedAt_status", (q) => q.eq("deletedAt", undefined).eq("status", "published"))
      .collect();
    const activeCourses = allCourses.length;

    // Get total lessons (non-deleted)
    const allLessons = await ctx.db.query("lessons").collect();
    const totalLessons = allLessons.filter((l) => l.deletedAt === undefined).length;

    // Get total users (non-deleted)
    const allUsers = await ctx.db.query("users").collect();
    const totalUsers = allUsers.filter((u) => u.deletedAt === undefined).length;

    return {
      totalCategories,
      activeCourses,
      totalLessons,
      totalUsers,
    };
  },
});

export const getPopularCourses = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 3 }) => {
    await requireUser(ctx, { requireGod: true });

    // Get published courses sorted by creation date (most recent first)
    const courses = await ctx.db
      .query("courses")
      .withIndex("deletedAt_status", (q) => q.eq("deletedAt", undefined).eq("status", "published"))
      .collect();

    // Sort by createdAt descending (most recent first)
    const sortedCourses = courses.sort((a, b) => b.createdAt - a.createdAt);

    // Return limited number of courses
    return sortedCourses.slice(0, limit);
  },
});

