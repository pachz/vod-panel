import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./utils/auth";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Internal query to get user ID from email
 */
export const getUserIdFromIdentity = internalQuery({
  args: {
    email: v.string(),
  },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email).eq("deletedAt", undefined))
      .first();

    return user?._id ?? null;
  },
});

/**
 * Internal mutation to store checkout session
 */
export const storeCheckoutSession = internalMutation({
  args: {
    sessionId: v.string(),
    userId: v.id("users"),
  },
  returns: v.id("checkoutSessions"),
  handler: async (ctx, args) => {
    const sessionId = await ctx.db.insert("checkoutSessions", {
      sessionId: args.sessionId,
      userId: args.userId,
      status: "pending",
      createdAt: Date.now(),
    });

    return sessionId;
  },
});

/**
 * Internal mutation to update checkout session when completed
 */
export const updateCheckoutSession = internalMutation({
  args: {
    sessionId: v.string(),
    customerId: v.optional(v.string()),
    subscriptionId: v.optional(v.string()),
    status: v.union(v.literal("complete"), v.literal("expired")),
  },
  returns: v.union(v.id("checkoutSessions"), v.null()),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("checkoutSessions")
      .withIndex("sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!session) {
      return null;
    }

    await ctx.db.patch(session._id, {
      status: args.status,
      customerId: args.customerId,
      subscriptionId: args.subscriptionId,
      completedAt: args.status === "complete" ? Date.now() : undefined,
    });

    return session._id;
  },
});

/**
 * Internal mutation to create or update subscription
 */
export const upsertSubscription = internalMutation({
  args: {
    subscriptionId: v.string(),
    userId: v.id("users"),
    customerId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due"),
      v.literal("unpaid"),
      v.literal("incomplete"),
      v.literal("trialing"),
    ),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
    canceledAt: v.optional(v.number()),
  },
  returns: v.id("subscriptions"),
  handler: async (ctx, args) => {
    // Check if subscription already exists
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("subscriptionId", (q) => q.eq("subscriptionId", args.subscriptionId))
      .first();

    if (existing) {
      // Update existing subscription
      await ctx.db.patch(existing._id, {
        status: args.status,
        currentPeriodStart: args.currentPeriodStart,
        currentPeriodEnd: args.currentPeriodEnd,
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        canceledAt: args.canceledAt,
        updatedAt: Date.now(),
      });
      return existing._id;
    } else {
      // Create new subscription
      const subscriptionId = await ctx.db.insert("subscriptions", {
        subscriptionId: args.subscriptionId,
        userId: args.userId,
        customerId: args.customerId,
        status: args.status,
        currentPeriodStart: args.currentPeriodStart,
        currentPeriodEnd: args.currentPeriodEnd,
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        canceledAt: args.canceledAt,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return subscriptionId;
    }
  },
});

/**
 * Internal query to get checkout session by customer ID
 */
export const getCheckoutSessionByCustomerId = internalQuery({
  args: {
    customerId: v.string(),
  },
  returns: v.array(v.object({
    _id: v.id("checkoutSessions"),
    userId: v.id("users"),
    sessionId: v.string(),
    customerId: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("checkoutSessions")
      .filter((q) => q.eq(q.field("customerId"), args.customerId))
      .collect();

    return sessions.map((s) => ({
      _id: s._id,
      userId: s.userId,
      sessionId: s.sessionId,
      customerId: s.customerId,
    }));
  },
});

/**
 * Query to get current user's subscription (public)
 */
export const getMySubscription = query({
  args: {},
  returns: v.union(
    v.object({
      subscriptionId: v.string(),
      status: v.union(
        v.literal("active"),
        v.literal("canceled"),
        v.literal("past_due"),
        v.literal("unpaid"),
        v.literal("incomplete"),
        v.literal("trialing"),
      ),
      currentPeriodStart: v.number(),
      currentPeriodEnd: v.number(),
      cancelAtPeriodEnd: v.boolean(),
      canceledAt: v.optional(v.number()),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    await requireUser(ctx);
    
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", userId as Id<"users">))
      .filter((q) => 
        q.or(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("status"), "trialing"),
        )
      )
      .first();

    if (!subscription) {
      return null;
    }

    return {
      subscriptionId: subscription.subscriptionId,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: subscription.canceledAt,
    };
  },
});

