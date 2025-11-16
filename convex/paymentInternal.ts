import { internalMutation, internalQuery, query, mutation } from "./_generated/server";
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
 * Internal query to get checkout session by session ID
 */
export const getCheckoutSessionBySessionId = internalQuery({
  args: {
    sessionId: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id("checkoutSessions"),
      userId: v.id("users"),
      sessionId: v.string(),
      customerId: v.optional(v.string()),
      subscriptionId: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("checkoutSessions")
      .withIndex("sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!session) {
      return null;
    }

    return {
      _id: session._id,
      userId: session.userId,
      sessionId: session.sessionId,
      customerId: session.customerId,
      subscriptionId: session.subscriptionId,
    };
  },
});

/**
 * Internal query to get subscription for a specific user (for actions)
 */
export const getMySubscriptionForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
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
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .order("desc")
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

/**
 * Internal query to get user by ID
 */
export const getUserById = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      isGod: v.optional(v.boolean()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return null;
    }

    return {
      _id: user._id,
      isGod: user.isGod,
    };
  },
});

/**
 * Internal query to get user with customer ID
 */
export const getUserWithCustomer = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      stripeCustomerId: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return null;
    }

    return {
      _id: user._id,
      stripeCustomerId: user.stripeCustomerId,
    };
  },
});

/**
 * Internal query to get full user details
 */
export const getUserFull = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return null;
    }

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    };
  },
});

/**
 * Internal mutation to update user's Stripe customer ID
 */
export const updateUserStripeCustomerId = internalMutation({
  args: {
    userId: v.id("users"),
    stripeCustomerId: v.string(),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(args.userId, {
      stripeCustomerId: args.stripeCustomerId,
    });

    return args.userId;
  },
});

/**
 * Query to get payment settings (selected product/price)
 */
export const getPaymentSettings = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      selectedProductId: v.string(),
      selectedPriceId: v.string(),
      productName: v.string(),
      priceAmount: v.number(),
      priceCurrency: v.string(),
      priceInterval: v.union(v.literal("month"), v.literal("year"), v.literal("week"), v.literal("day")),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("paymentSettings")
      .order("desc")
      .first();

    if (!settings) {
      return null;
    }

    return {
      selectedProductId: settings.selectedProductId,
      selectedPriceId: settings.selectedPriceId,
      productName: settings.productName,
      priceAmount: settings.priceAmount,
      priceCurrency: settings.priceCurrency,
      priceInterval: settings.priceInterval,
    };
  },
});

/**
 * Public query to get payment settings (for display)
 */
export const getPaymentSettingsPublic = query({
  args: {},
  returns: v.union(
    v.object({
      selectedProductId: v.string(),
      selectedPriceId: v.string(),
      productName: v.string(),
      priceAmount: v.number(),
      priceCurrency: v.string(),
      priceInterval: v.union(v.literal("month"), v.literal("year"), v.literal("week"), v.literal("day")),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("paymentSettings")
      .order("desc")
      .first();

    if (!settings) {
      return null;
    }

    return {
      selectedProductId: settings.selectedProductId,
      selectedPriceId: settings.selectedPriceId,
      productName: settings.productName,
      priceAmount: settings.priceAmount,
      priceCurrency: settings.priceCurrency,
      priceInterval: settings.priceInterval,
    };
  },
});

/**
 * Mutation to set payment settings (admin only)
 */
export const setPaymentSettings = mutation({
  args: {
    selectedProductId: v.string(),
    selectedPriceId: v.string(),
    productName: v.string(),
    priceAmount: v.number(),
    priceCurrency: v.string(),
    priceInterval: v.union(v.literal("month"), v.literal("year"), v.literal("week"), v.literal("day")),
  },
  returns: v.id("paymentSettings"),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGod: true });

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not found");
    }

    // Delete existing settings (we only want one active setting)
    const existing = await ctx.db
      .query("paymentSettings")
      .collect();

    for (const setting of existing) {
      await ctx.db.delete(setting._id);
    }

    // Create new settings
    const settingsId = await ctx.db.insert("paymentSettings", {
      selectedProductId: args.selectedProductId,
      selectedPriceId: args.selectedPriceId,
      productName: args.productName,
      priceAmount: args.priceAmount,
      priceCurrency: args.priceCurrency,
      priceInterval: args.priceInterval,
      updatedBy: userId as Id<"users">,
      updatedAt: Date.now(),
    });

    return settingsId;
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

    // Get subscription - include active or trialing (even if scheduled to cancel)
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", userId as Id<"users">))
      .filter((q) => 
        q.or(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("status"), "trialing")
        )
      )
      .order("desc")
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

