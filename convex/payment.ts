"use node";

import { action, internalAction } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import Stripe from "stripe";
import { requireUserAction } from "./utils/auth";
import { internal } from "./_generated/api";

/**
 * Helper function to safely convert Stripe timestamp (seconds) to milliseconds
 * Stripe timestamps are in Unix seconds, JavaScript Date needs milliseconds
 */
function convertStripeTimestamp(timestamp: any, fieldName: string): number {
  if (timestamp === undefined || timestamp === null) {
    throw new Error(`Missing required timestamp field: ${fieldName}`);
  }

  const numTimestamp =
    typeof timestamp === "string"
      ? Number(timestamp)
      : typeof timestamp === "bigint"
        ? Number(timestamp)
        : timestamp;

  if (isNaN(numTimestamp) || numTimestamp <= 0) {
    throw new Error(`Invalid timestamp for ${fieldName}: ${timestamp}`);
  }

  return numTimestamp * 1000;
}

/**
 * Normalize an existing stored Unix timestamp so we can fix legacy
 * values that were accidentally stored in seconds instead of ms.
 * - If value looks like seconds (10 digits, < 1e11), convert to ms
 * - If it already looks like ms (>= 1e11), return as-is
 */
function normalizeStoredTimestamp(value: any, fieldName: string): number {
  if (value === undefined || value === null) {
    throw new Error(`Missing stored timestamp field: ${fieldName}`);
  }

  const numValue =
    typeof value === "string"
      ? Number(value)
      : typeof value === "bigint"
        ? Number(value)
        : value;

  if (isNaN(numValue) || numValue <= 0) {
    throw new Error(`Invalid stored timestamp for ${fieldName}: ${value}`);
  }

  // Heuristic: anything less than ~Sat Mar 03 5138 in ms is treated as ms.
  // Current ms timestamps are ~1.7e12; current seconds are ~1.7e9.
  if (numValue < 1e11) {
    console.warn("Normalizing legacy seconds timestamp to ms", {
      fieldName,
      original: numValue,
      normalized: numValue * 1000,
    });
    return numValue * 1000;
  }

  return numValue;
}

/**
 * Get billing interval from Stripe subscription (requires expanded items.data.price).
 * Returns the interval from the first subscription item's price so yearly plans show "year" not "month".
 */
function getSubscriptionInterval(subscription: any): { interval: string; intervalCount: number } | null {
  const item = subscription.items?.data?.[0];
  if (!item) return null;
  const price = item.price;
  if (!price || typeof price === "string") return null;
  const recurring = price.recurring;
  if (!recurring?.interval) return null;
  return {
    interval: String(recurring.interval).toLowerCase(),
    intervalCount: typeof recurring.interval_count === "number" ? recurring.interval_count : 1,
  };
}

/**
 * Helper function to safely get subscription dates from Stripe subscription object
 * Handles missing dates gracefully by using fallback values.
 * When fallback is used, respects billing interval (e.g. yearly = 365 days, not 30).
 */
function getSubscriptionDates(
  subscription: any,
  existingDates?: { currentPeriodStart?: number; currentPeriodEnd?: number }
): { currentPeriodStart: number; currentPeriodEnd: number } {
  // Try to get dates from Stripe subscription
  let currentPeriodStart = subscription.current_period_start;
  let currentPeriodEnd = subscription.current_period_end;
  
  // If not found, try camelCase
  if (!currentPeriodStart) {
    currentPeriodStart = subscription.currentPeriodStart;
  }
  if (!currentPeriodEnd) {
    currentPeriodEnd = subscription.currentPeriodEnd;
  }

  // If dates are missing, use fallback logic
  if (!currentPeriodStart || !currentPeriodEnd) {
    console.warn("Subscription missing period dates, using fallback", {
      subscriptionId: subscription.id,
      status: subscription.status,
      hasExistingDates: !!existingDates,
    });

    // Try to use existing dates from database if they're valid
    if (
      existingDates?.currentPeriodStart &&
      existingDates.currentPeriodStart > 0 &&
      existingDates?.currentPeriodEnd &&
      existingDates.currentPeriodEnd > 0
    ) {
      // Normalize existing dates so old second-based values get fixed to ms.
      const normalizedStart = normalizeStoredTimestamp(
        existingDates.currentPeriodStart,
        "existing.currentPeriodStart",
      );
      const normalizedEnd = normalizeStoredTimestamp(
        existingDates.currentPeriodEnd,
        "existing.currentPeriodEnd",
      );

      return {
        currentPeriodStart: normalizedStart,
        currentPeriodEnd: normalizedEnd,
      };
    }

    // Use billing interval for fallback period length (yearly = 365 days, not 30)
    const intervalInfo = getSubscriptionInterval(subscription);
    const daysPerPeriod = intervalInfo
      ? (intervalInfo.interval === "year"
          ? 365 * intervalInfo.intervalCount
          : intervalInfo.interval === "month"
            ? 30 * intervalInfo.intervalCount
            : intervalInfo.interval === "week"
              ? 7 * intervalInfo.intervalCount
              : 30)
      : 30;
    const startDate = Date.now();
    const endDate = Date.now() + daysPerPeriod * 24 * 60 * 60 * 1000;

    return {
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
    };
  }

  // Convert Stripe timestamps (seconds) to milliseconds
  return {
    currentPeriodStart: convertStripeTimestamp(currentPeriodStart, "current_period_start"),
    currentPeriodEnd: convertStripeTimestamp(currentPeriodEnd, "current_period_end"),
  };
}

/**
 * Fetch products and prices from Stripe
 * Returns all active products with their prices
 */
export const fetchStripeProducts = action({
  args: {},
  returns: v.array(v.object({
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    active: v.boolean(),
    prices: v.array(v.object({
      id: v.string(),
      active: v.boolean(),
      currency: v.string(),
      unitAmount: v.number(),
      recurring: v.optional(v.object({
        interval: v.string(),
        intervalCount: v.number(),
      })),
      type: v.string(),
    })),
  })),
  handler: async (ctx) => {
    // Require admin authentication
    const { userId } = await requireUserAction(ctx);
    
    // Check if user is admin
    const user = await ctx.runQuery((internal as any).paymentInternal.getUserById, {
      userId: userId as any,
    });
    
    if (!user || !user.isGod) {
      throw new Error("Unauthorized: Admin access required");
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured. Please set it in your Convex environment variables.");
    }

    const stripe = new Stripe(stripeSecretKey);

    try {
      // Fetch all products
      const products = await stripe.products.list({ active: true, limit: 100 });
      
      // Fetch all prices
      const prices = await stripe.prices.list({ active: true, limit: 100 });

      // Group prices by product
      const productsWithPrices = products.data.map((product) => {
        const productPrices = prices.data
          .filter((price) => price.product === product.id)
          .map((price) => ({
            id: price.id,
            active: price.active,
            currency: price.currency,
            unitAmount: price.unit_amount || 0,
            recurring: price.recurring ? {
              interval: price.recurring.interval,
              intervalCount: price.recurring.interval_count,
            } : undefined,
            type: price.type,
          }));

        return {
          id: product.id,
          name: product.name,
          description: product.description || undefined,
          active: product.active,
          prices: productPrices,
        };
      });

      return productsWithPrices;
    } catch (error) {
      console.error("Error fetching Stripe products:", error);
      throw new Error(
        error instanceof Error 
          ? `Failed to fetch products: ${error.message}`
          : "Failed to fetch products"
      );
    }
  },
});

/**
 * Helper function to create a Stripe customer for a user
 */
async function createStripeCustomerForUser(
  ctx: any,
  userId: string,
  stripeSecretKey: string
): Promise<string> {
  // Get user email for Stripe customer
  const userFull = await ctx.runQuery((internal as any).paymentInternal.getUserFull, {
    userId: userId as any,
  });

  if (!userFull) {
    throw new Error("User details not found");
  }

  // Create Stripe customer
  const stripe = new Stripe(stripeSecretKey);
  const customer = await stripe.customers.create({
    email: userFull.email || undefined,
    name: userFull.name || undefined,
    phone: userFull.phone || undefined,
    metadata: {
      userId: userId,
    },
  });

  // Store customer ID in database
  await ctx.runMutation((internal as any).paymentInternal.updateUserStripeCustomerId, {
    userId: userId as any,
    stripeCustomerId: customer.id,
  });

  return customer.id;
}

/**
 * Get or create a Stripe customer for the current user
 * Returns the Stripe customer ID
 */
export const getOrCreateStripeCustomer = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    // Require user to be authenticated
    const { userId } = await requireUserAction(ctx);

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured. Please set it in your Convex environment variables.");
    }

    // Get user info
    const user = await ctx.runQuery((internal as any).paymentInternal.getUserById, {
      userId: userId as any,
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Check if user already has a Stripe customer ID
    const userWithCustomer = await ctx.runQuery((internal as any).paymentInternal.getUserWithCustomer, {
      userId: userId as any,
    });

    if (userWithCustomer?.stripeCustomerId) {
      // Verify customer still exists in Stripe
      const stripe = new Stripe(stripeSecretKey);
      try {
        await stripe.customers.retrieve(userWithCustomer.stripeCustomerId);
        return userWithCustomer.stripeCustomerId;
      } catch (error) {
        // Customer doesn't exist in Stripe, create a new one
        console.log("Stripe customer not found, creating new one");
        return await createStripeCustomerForUser(ctx, userId, stripeSecretKey);
      }
    }

    // Create new customer
    return await createStripeCustomerForUser(ctx, userId, stripeSecretKey);
  },
});

/**
 * Creates a Stripe checkout session for subscriptions.
 * Uses the selected product/price from payment settings.
 * 
 * Note: You'll need to set STRIPE_SECRET_KEY in your Convex environment variables.
 * For test mode, use a test key starting with sk_test_
 */
export const createCheckoutSession = action({
  args: {
    priceId: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    // Require user to be authenticated
    const { userId } = await requireUserAction(ctx);
    
    // Get Stripe secret key from environment
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured. Please set it in your Convex environment variables.");
    }

    // Get or create Stripe customer
    // First check if user already has a customer ID
    const userWithCustomer = await ctx.runQuery((internal as any).paymentInternal.getUserWithCustomer, {
      userId: userId as any,
    });

    let customerId: string;
    
    if (userWithCustomer?.stripeCustomerId) {
      // Verify customer still exists in Stripe
      const stripe = new Stripe(stripeSecretKey);
      try {
        await stripe.customers.retrieve(userWithCustomer.stripeCustomerId);
        customerId = userWithCustomer.stripeCustomerId;
      } catch (error) {
        // Customer doesn't exist in Stripe, create a new one
        console.log("Stripe customer not found, creating new one");
        customerId = await createStripeCustomerForUser(ctx, userId, stripeSecretKey);
      }
    } else {
      // Create new Stripe customer
      customerId = await createStripeCustomerForUser(ctx, userId, stripeSecretKey);
    }

    // Get selected product/price from settings
    const paymentSettings = await ctx.runQuery((internal as any).paymentInternal.getPaymentSettings);

    if (!paymentSettings) {
      throw new Error("No product/price configured. Please configure a product in the admin section.");
    }

    // Use provided priceId (yearly) or fall back to monthly (default)
    const allowedPriceIds = [
      paymentSettings.selectedMonthlyPriceId,
      paymentSettings.selectedYearlyPriceId,
    ].filter((id): id is string => !!id);
    const priceId =
      args.priceId && allowedPriceIds.includes(args.priceId)
        ? args.priceId
        : paymentSettings.selectedMonthlyPriceId;

    // Initialize Stripe client
    const stripe = new Stripe(stripeSecretKey);

    try {
      // Create checkout session with selected price and customer
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        allow_promotion_codes: true,
        success_url: `${process.env.PANEL_URL || "http://localhost:5173"}/payments?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.PANEL_URL || "http://localhost:5173"}/payments?canceled=true`,
        // Store user ID in metadata for webhook processing
        metadata: {
          userId: userId,
        },
      });

      if (!session.url || !session.id) {
        throw new Error("Failed to create checkout session URL");
      }

      // Store the checkout session in the database
      // Using type assertion until API regenerates
      await ctx.runMutation((internal as any).paymentInternal.storeCheckoutSession, {
        sessionId: session.id,
        userId: userId,
      });

      return session.url;
    } catch (error) {
      console.error("Stripe checkout session creation error:", error);
      throw new Error(
        error instanceof Error 
          ? `Failed to create checkout session: ${error.message}`
          : "Failed to create checkout session"
      );
    }
  },
});

/**
 * Sync subscription data directly from Stripe by subscription ID
 * Useful for fixing corrupted data or re-syncing after issues
 */
export const syncSubscriptionFromStripe = action({
  args: {
    subscriptionId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    // Require user to be authenticated
    const { userId } = await requireUserAction(ctx);

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured. Please set it in your Convex environment variables.");
    }

    const stripe = new Stripe(stripeSecretKey);

    try {
      // Get subscription from Stripe (expand price so we can store billing interval e.g. year vs month)
      const subscription = await stripe.subscriptions.retrieve(args.subscriptionId, {
        expand: ["items.data.price"],
      });

      // Verify this subscription belongs to the user first
      const userSubscription = await ctx.runQuery((internal as any).paymentInternal.getMySubscriptionForUser, {
        userId: userId,
      });

      if (!userSubscription || userSubscription.subscriptionId !== args.subscriptionId) {
        throw new Error("Subscription not found or does not belong to you");
      }

      // Log full subscription object for debugging
      console.log("Stripe subscription retrieved - full object keys:", Object.keys(subscription));
      console.log("Stripe subscription retrieved - details:", {
        id: subscription.id,
        status: subscription.status,
        current_period_start: (subscription as any).current_period_start,
        current_period_end: (subscription as any).current_period_end,
        currentPeriodStart: (subscription as any).currentPeriodStart,
        currentPeriodEnd: (subscription as any).currentPeriodEnd,
        cancel_at_period_end: (subscription as any).cancel_at_period_end,
        canceled_at: (subscription as any).canceled_at,
        created: (subscription as any).created,
        billing_cycle_anchor: (subscription as any).billing_cycle_anchor,
      });

      // Get dates safely using helper function
      const dates = getSubscriptionDates(subscription, {
        currentPeriodStart: userSubscription.currentPeriodStart,
        currentPeriodEnd: userSubscription.currentPeriodEnd,
      });
      const intervalInfo = getSubscriptionInterval(subscription);

      // Update subscription in database with fresh data from Stripe
      await ctx.runMutation((internal as any).paymentInternal.upsertSubscription, {
        subscriptionId: subscription.id,
        userId: userId as any,
        customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
        status: subscription.status as any,
        currentPeriodStart: dates.currentPeriodStart,
        currentPeriodEnd: dates.currentPeriodEnd,
        cancelAtPeriodEnd: (subscription as any).cancel_at_period_end || false,
        canceledAt: (subscription as any).canceled_at ? convertStripeTimestamp((subscription as any).canceled_at, "canceled_at") : undefined,
        interval: intervalInfo?.interval,
        intervalCount: intervalInfo?.intervalCount,
      });

      return {
        success: true,
        message: "Subscription data synced successfully",
      };
    } catch (error) {
      console.error("Error syncing subscription from Stripe:", error);
      throw new Error(
        error instanceof Error 
          ? `Failed to sync subscription: ${error.message}`
          : "Failed to sync subscription"
      );
    }
  },
});

/**
 * Admin-only: sync a specific user's Stripe-backed subscription directly from Stripe.
 * Used from the admin panel to refresh status/period dates when something looks off.
 */
export const adminSyncUserSubscriptionFromStripe = action({
  args: {
    userId: v.id("users"),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    status: v.optional(v.string()),
    subscriptionId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Require auth and admin privileges
    await requireUserAction(ctx);
    await ctx.runQuery(internal.user.requireAdminQuery);

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error(
        "STRIPE_SECRET_KEY is not configured. Please set it in your Convex environment variables.",
      );
    }

    // Ensure target user exists and has a Stripe customer ID
    const targetUser = await ctx.runQuery(
      (internal as any).paymentInternal.getUserWithCustomer,
      { userId: args.userId as any },
    );

    if (!targetUser) {
      throw new Error("User not found");
    }

    if (!targetUser.stripeCustomerId) {
      return {
        success: false,
        message: "User does not have a Stripe customer ID.",
        status: undefined,
        subscriptionId: undefined,
      };
    }

    // Get the most recent subscription for this user
    const userSubscription = await ctx.runQuery(
      (internal as any).paymentInternal.getMySubscriptionForUser,
      {
        userId: args.userId as any,
      },
    );

    if (!userSubscription) {
      return {
        success: false,
        message: "No subscription found for this user.",
        status: undefined,
        subscriptionId: undefined,
      };
    }

    // Only Stripe-backed subscriptions can be refreshed via the API
    if (!userSubscription.subscriptionId.startsWith("sub_")) {
      return {
        success: false,
        message: "This subscription is not managed by Stripe and cannot be refreshed.",
        status: userSubscription.status,
        subscriptionId: userSubscription.subscriptionId,
      };
    }

    const stripe = new Stripe(stripeSecretKey);

    try {
      const subscription = await stripe.subscriptions.retrieve(
        userSubscription.subscriptionId,
        {
          expand: ["items.data.price"],
        },
      );

      const dates = getSubscriptionDates(subscription, {
        currentPeriodStart: userSubscription.currentPeriodStart,
        currentPeriodEnd: userSubscription.currentPeriodEnd,
      });
      const intervalInfo = getSubscriptionInterval(subscription);

      await ctx.runMutation(
        (internal as any).paymentInternal.upsertSubscription,
        {
          subscriptionId: subscription.id,
          userId: args.userId as any,
          customerId:
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer.id,
          status: subscription.status as any,
          currentPeriodStart: dates.currentPeriodStart,
          currentPeriodEnd: dates.currentPeriodEnd,
          cancelAtPeriodEnd:
            (subscription as any).cancel_at_period_end || false,
          canceledAt: (subscription as any).canceled_at
            ? convertStripeTimestamp(
                (subscription as any).canceled_at,
                "canceled_at",
              )
            : undefined,
          interval: intervalInfo?.interval,
          intervalCount: intervalInfo?.intervalCount,
        },
      );

      return {
        success: true,
        message: "Subscription data synced successfully from Stripe.",
        status: subscription.status,
        subscriptionId: subscription.id,
      };
    } catch (error) {
      console.error("Error syncing user subscription from Stripe (admin):", error);
      throw new Error(
        error instanceof Error
          ? `Failed to sync subscription: ${error.message}`
          : "Failed to sync subscription",
      );
    }
  },
});

/**
 * Internal action: sync all Stripe-backed subscription statuses from Stripe.
 * Used by the daily cron to keep subscription status, period dates, and cancel state in sync.
 */
export const syncAllSubscriptionsFromStripe = internalAction({
  args: {},
  returns: v.object({ synced: v.number(), errors: v.number() }),
  handler: async (ctx) => {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error("STRIPE_SECRET_KEY is not configured; skipping subscription sync.");
      return { synced: 0, errors: 0 };
    }

    const list = await ctx.runQuery(internal.paymentInternal.listStripeSubscriptionsForSync, {});
    const stripe = new Stripe(stripeSecretKey);
    let synced = 0;
    let errors = 0;

    for (const row of list) {
      try {
        const subscription = await stripe.subscriptions.retrieve(row.subscriptionId, {
          expand: ["items.data.price"],
        });
        const dates = getSubscriptionDates(subscription, {
          currentPeriodStart: row.currentPeriodStart,
          currentPeriodEnd: row.currentPeriodEnd,
        });
        const intervalInfo = getSubscriptionInterval(subscription);
        await ctx.runMutation(internal.paymentInternal.upsertSubscription, {
          subscriptionId: subscription.id,
          userId: row.userId,
          customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
          status: subscription.status as "active" | "canceled" | "past_due" | "unpaid" | "incomplete" | "trialing",
          currentPeriodStart: dates.currentPeriodStart,
          currentPeriodEnd: dates.currentPeriodEnd,
          cancelAtPeriodEnd: (subscription as { cancel_at_period_end?: boolean }).cancel_at_period_end ?? false,
          canceledAt: (subscription as { canceled_at?: number }).canceled_at
            ? convertStripeTimestamp((subscription as { canceled_at: number }).canceled_at, "canceled_at")
            : undefined,
          interval: intervalInfo?.interval,
          intervalCount: intervalInfo?.intervalCount,
        });
        synced += 1;
      } catch (err) {
        console.error(`Failed to sync subscription ${row.subscriptionId}:`, err);
        errors += 1;
      }
    }

    if (list.length > 0) {
      console.log(`Subscription sync complete: ${synced} synced, ${errors} errors`);
    }
    return { synced, errors };
  },
});

/**
 * Manually sync subscription status from Stripe
 * Useful when webhooks are not set up yet
 * Call this after user redirects from Stripe checkout
 */
export const syncSubscriptionStatus = action({
  args: {
    sessionId: v.string(),
  },
  returns: v.union(
    v.object({
      success: v.boolean(),
      subscriptionId: v.optional(v.string()),
      status: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    // Require user to be authenticated
    const { userId } = await requireUserAction(ctx);

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured. Please set it in your Convex environment variables.");
    }

    const stripe = new Stripe(stripeSecretKey);

    try {
      // Retrieve the checkout session from Stripe
      const session = await stripe.checkout.sessions.retrieve(args.sessionId, {
        expand: ["subscription"],
      });

      // Check if session exists in our database
      const existingSession = await ctx.runQuery((internal as any).paymentInternal.getCheckoutSessionBySessionId, {
        sessionId: args.sessionId,
      });

      if (!existingSession) {
        throw new Error("Checkout session not found in database");
      }

      // Verify the session belongs to the authenticated user
      if (existingSession.userId !== userId) {
        throw new Error("Unauthorized: This checkout session does not belong to you");
      }

      // Get or create Stripe customer and store it
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      if (customerId) {
        // Ensure customer ID is stored in user record
        await ctx.runMutation((internal as any).paymentInternal.updateUserStripeCustomerId, {
          userId: userId as any,
          stripeCustomerId: customerId,
        });
      }

      // Update checkout session status
      await ctx.runMutation((internal as any).paymentInternal.updateCheckoutSession, {
        sessionId: session.id,
        customerId: customerId,
        subscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
        status: session.payment_status === "paid" ? "complete" : "expired",
      });

      // If there's a subscription, fetch and update it
      if (session.subscription) {
        const subscriptionId = typeof session.subscription === "string" 
          ? session.subscription 
          : session.subscription.id;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items.data.price"],
        });

        // Get existing subscription to use as fallback for dates
        const existingSub = await ctx.runQuery((internal as any).paymentInternal.getMySubscriptionForUser, {
          userId: existingSession.userId,
        });

        // Get dates safely
        const dates = getSubscriptionDates(subscription, existingSub ? {
          currentPeriodStart: existingSub.currentPeriodStart,
          currentPeriodEnd: existingSub.currentPeriodEnd,
        } : undefined);
        const intervalInfo = getSubscriptionInterval(subscription);

        await ctx.runMutation((internal as any).paymentInternal.upsertSubscription, {
          subscriptionId: subscription.id,
          userId: existingSession.userId,
          customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
          status: subscription.status as any,
          currentPeriodStart: dates.currentPeriodStart,
          currentPeriodEnd: dates.currentPeriodEnd,
          cancelAtPeriodEnd: (subscription as any).cancel_at_period_end || false,
          canceledAt: (subscription as any).canceled_at ? convertStripeTimestamp((subscription as any).canceled_at, "canceled_at") : undefined,
          interval: intervalInfo?.interval,
          intervalCount: intervalInfo?.intervalCount,
        });

        return {
          success: true,
          subscriptionId: subscription.id,
          status: subscription.status,
        };
      }

      return {
        success: true,
        subscriptionId: undefined,
        status: undefined,
      };
    } catch (error) {
      console.error("Error syncing subscription status:", error);
      throw new Error(
        error instanceof Error 
          ? `Failed to sync subscription: ${error.message}`
          : "Failed to sync subscription"
      );
    }
  },
});

/**
 * Cancel user's subscription
 * Cancels the subscription at the end of the current period
 */
export const cancelSubscription = action({
  args: {},
  returns: v.object({
    success: v.boolean(),
    cancelAtPeriodEnd: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx) => {
    // Require user to be authenticated
    const { userId } = await requireUserAction(ctx);

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured. Please set it in your Convex environment variables.");
    }

    const stripe = new Stripe(stripeSecretKey);

    try {
      // Get user's active subscription
      const subscription = await ctx.runQuery((internal as any).paymentInternal.getMySubscriptionForUser, {
        userId: userId,
      });

      if (!subscription) {
        throw new Error("No active subscription found");
      }

      // Cancel the subscription at period end via Stripe
      const updatedSubscription = await stripe.subscriptions.update(subscription.subscriptionId, {
        cancel_at_period_end: true,
      });

      // Get dates safely with fallback to existing dates
      const dates = getSubscriptionDates(updatedSubscription, {
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      });

      // Update subscription in database (preserve interval so yearly stays yearly)
      await ctx.runMutation((internal as any).paymentInternal.upsertSubscription, {
        subscriptionId: updatedSubscription.id,
        userId: userId as any,
        customerId: typeof updatedSubscription.customer === "string" 
          ? updatedSubscription.customer 
          : updatedSubscription.customer.id,
        status: updatedSubscription.status as any,
        currentPeriodStart: dates.currentPeriodStart,
        currentPeriodEnd: dates.currentPeriodEnd,
        cancelAtPeriodEnd: (updatedSubscription as any).cancel_at_period_end || false,
        canceledAt: (updatedSubscription as any).canceled_at ? convertStripeTimestamp((updatedSubscription as any).canceled_at, "canceled_at") : undefined,
        interval: subscription.interval,
        intervalCount: subscription.intervalCount,
      });

      return {
        success: true,
        cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
        message: "Subscription will be canceled at the end of the current billing period.",
      };
    } catch (error) {
      console.error("Error canceling subscription:", error);
      throw new Error(
        error instanceof Error 
          ? `Failed to cancel subscription: ${error.message}`
          : "Failed to cancel subscription"
      );
    }
  },
});

/**
 * Reactivate a canceled subscription
 * Removes the cancellation scheduled for period end
 */
export const reactivateSubscription = action({
  args: {},
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx) => {
    // Require user to be authenticated
    const { userId } = await requireUserAction(ctx);

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured. Please set it in your Convex environment variables.");
    }

    const stripe = new Stripe(stripeSecretKey);

    try {
      // Get user's subscription (including canceled ones)
      const subscription = await ctx.runQuery((internal as any).paymentInternal.getMySubscriptionForUser, {
        userId: userId,
      });

      if (!subscription) {
        throw new Error("No subscription found");
      }

      // Reactivate the subscription by removing cancel_at_period_end
      const updatedSubscription = await stripe.subscriptions.update(subscription.subscriptionId, {
        cancel_at_period_end: false,
      });

      // Get dates safely with fallback to existing dates
      const dates = getSubscriptionDates(updatedSubscription, {
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      });

      // Update subscription in database (preserve interval so yearly stays yearly)
      await ctx.runMutation((internal as any).paymentInternal.upsertSubscription, {
        subscriptionId: updatedSubscription.id,
        userId: userId as any,
        customerId: typeof updatedSubscription.customer === "string" 
          ? updatedSubscription.customer 
          : updatedSubscription.customer.id,
        status: updatedSubscription.status as any,
        currentPeriodStart: dates.currentPeriodStart,
        currentPeriodEnd: dates.currentPeriodEnd,
        cancelAtPeriodEnd: (updatedSubscription as any).cancel_at_period_end || false,
        canceledAt: (updatedSubscription as any).canceled_at ? convertStripeTimestamp((updatedSubscription as any).canceled_at, "canceled_at") : undefined,
        interval: subscription.interval,
        intervalCount: subscription.intervalCount,
      });

      return {
        success: true,
        message: "Subscription has been reactivated.",
      };
    } catch (error) {
      console.error("Error reactivating subscription:", error);
      throw new Error(
        error instanceof Error 
          ? `Failed to reactivate subscription: ${error.message}`
          : "Failed to reactivate subscription"
      );
    }
  },
});

/** Prefix for admin-granted subscription IDs (not real Stripe IDs) */
const ADMIN_GRANT_SUBSCRIPTION_ID_PREFIX = "admin-grant-";

/**
 * Create a Stripe Customer Portal session
 * Allows users to manage their subscription, payment methods, and billing history
 */
export const createCustomerPortalSession = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    // Require user to be authenticated
    const { userId } = await requireUserAction(ctx);

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured. Please set it in your Convex environment variables.");
    }

    const stripe = new Stripe(stripeSecretKey);

    try {
      // Get user's Stripe customer ID
      const userWithCustomer = await ctx.runQuery((internal as any).paymentInternal.getUserWithCustomer, {
        userId: userId as any,
      });

      let customerId: string;

      if (!userWithCustomer?.stripeCustomerId) {
        // Try to get from subscription if customer ID not stored
        const subscription = await ctx.runQuery((internal as any).paymentInternal.getMySubscriptionForUser, {
          userId: userId,
        });

        if (!subscription) {
          throw new Error("No subscription found and no customer ID stored");
        }

        // Admin-granted subscriptions have no Stripe subscription; cannot open portal
        if (subscription.subscriptionId.startsWith(ADMIN_GRANT_SUBSCRIPTION_ID_PREFIX)) {
          throw new ConvexError({ code: "ADMIN_GRANTED_SUBSCRIPTION", message: "Your subscription was granted by an admin. To change it, contact support." });
        }

        // Get subscription from Stripe to get customer ID
        const stripeSubscription = await stripe.subscriptions.retrieve(subscription.subscriptionId);
        customerId = typeof stripeSubscription.customer === "string" 
          ? stripeSubscription.customer 
          : stripeSubscription.customer.id;

        // Store customer ID for future use
        await ctx.runMutation((internal as any).paymentInternal.updateUserStripeCustomerId, {
          userId: userId as any,
          stripeCustomerId: customerId,
        });
      } else {
        customerId = userWithCustomer.stripeCustomerId;
      }

      // Verify customer exists in Stripe
      try {
        await stripe.customers.retrieve(customerId);
      } catch (error) {
        // Check if this is a "not found" error (customer doesn't exist in Stripe)
        // This can happen when Stripe account/token changed
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isNotFoundError = 
          (error instanceof Stripe.errors.StripeInvalidRequestError && 
           (error as any).code === 'resource_missing') ||
          errorMessage.includes('not found') ||
          errorMessage.includes('No such customer');
        
        if (isNotFoundError) {
          // Don't reset admin-granted subscriptions when Stripe customer is missing
          const subscription = await ctx.runQuery((internal as any).paymentInternal.getMySubscriptionForUser, {
            userId: userId,
          });
          if (subscription?.subscriptionId.startsWith(ADMIN_GRANT_SUBSCRIPTION_ID_PREFIX)) {
            await ctx.runMutation((internal as any).paymentInternal.clearUserStripeCustomerId, {
              userId: userId as any,
            });
            throw new ConvexError({ code: "ADMIN_GRANTED_SUBSCRIPTION", message: "Your subscription was granted by an admin. To change it, contact support." });
          }
          // Customer not found - likely Stripe account/token changed
          // Reset subscription status and clear customer ID
          console.log(`Customer ${customerId} not found in Stripe. Resetting subscription status.`);
          await ctx.runMutation((internal as any).paymentInternal.resetSubscriptionStatus, {
            userId: userId as any,
          });
          throw new Error("Your subscription has been reset because the payment account was changed. Please subscribe again.");
        }
        // Re-throw other errors (network issues, etc.)
        throw error;
      }

      // Create customer portal session
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.PANEL_URL || "http://localhost:5173"}/payments`,
      });

      if (!portalSession.url) {
        throw new Error("Failed to create customer portal session URL");
      }

      return portalSession.url;
    } catch (error) {
      console.error("Error creating customer portal session:", error);
      // Preserve ConvexError so client receives structured data (e.g. ADMIN_GRANTED_SUBSCRIPTION)
      if (error instanceof ConvexError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      // Preserve user-facing messages; don't wrap in technical "Failed to create..." text
      const isUserFacing =
        message.includes("granted by an admin") ||
        message.includes("contact support") ||
        message.includes("subscription has been reset") ||
        message.includes("Please subscribe again") ||
        message.includes("No subscription found") ||
        message === "Failed to create customer portal session URL";
      if (isUserFacing) {
        throw new Error(message);
      }
      throw new Error("We couldn't open the billing portal. Please try again or contact support.");
    }
  },
});

/**
 * Webhook handler for Stripe events (snapshot / full payloads)
 * This should be called from an HTTP endpoint
 * Using internalAction since it's only called from our HTTP endpoint
 */
export const handleStripeWebhook = internalAction({
  args: {
    body: v.string(),
    signature: v.string(),
  },
  returns: v.object({ received: v.boolean() }),
  handler: async (ctx, args) => {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }

    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured. Set this in your Convex environment variables.");
    }

    const stripe = new Stripe(stripeSecretKey);

    let event: Stripe.Event;
    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(args.body, args.signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      throw new Error("Webhook signature verification failed");
    }

    // Basic logging so we can test and inspect incoming events
    console.log("Stripe webhook received", {
      id: event.id,
      type: event.type,
    });

    // Handle different event types
    switch (event.type) {
      // SNAPSHOT endpoint is configured in Stripe to send full resource objects,
      // so we can safely rely on event.data.object containing all the fields we need.
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(ctx, session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(ctx, stripe, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(ctx, stripe, subscription);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return { received: true };
  },
});

/**
 * Webhook handler for Stripe events delivered as THIN payloads.
 * In this mode Stripe only sends minimal objects (typically just IDs),
 * so we re-fetch the full resource from the Stripe API before processing.
 */
export const handleStripeThinWebhook = internalAction({
  args: {
    body: v.string(),
    signature: v.string(),
  },
  returns: v.object({ received: v.boolean() }),
  handler: async (ctx, args) => {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_THIN_WEBHOOK_SECRET;

    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }

    if (!webhookSecret) {
      throw new Error(
        "STRIPE_THIN_WEBHOOK_SECRET is not configured. Set this in your Convex environment variables.",
      );
    }

    const stripe = new Stripe(stripeSecretKey);

    let event: Stripe.Event;
    try {
      // Verify webhook signature for the THIN endpoint
      event = stripe.webhooks.constructEvent(
        args.body,
        args.signature,
        webhookSecret,
      );
    } catch (err) {
      console.error("Thin webhook signature verification failed:", err);
      throw new Error("Webhook signature verification failed");
    }

    console.log("Stripe THIN webhook received", {
      id: event.id,
      type: event.type,
    });

    switch (event.type) {
      case "checkout.session.completed": {
        // Thin events only include a minimal object; fetch full session by ID
        const thinSession = event.data.object as Partial<Stripe.Checkout.Session> & {
          id?: string;
        };
        if (!thinSession.id) {
          console.error(
            "Thin checkout.session.completed event missing session id",
          );
          break;
        }

        const fullSession = await stripe.checkout.sessions.retrieve(
          thinSession.id,
          {
            // We want subscription details as well, same as the snapshot handler
            expand: ["subscription"],
          },
        );
        await handleCheckoutSessionCompleted(ctx, fullSession);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        // For subscriptions we already re-fetch inside handleSubscriptionUpdate,
        // so it's safe to pass the thin object as long as it has an ID.
        const thinSub = event.data.object as Stripe.Subscription;
        if (!thinSub.id) {
          console.error(
            "Thin customer.subscription.* event missing subscription id",
          );
          break;
        }
        await handleSubscriptionUpdate(ctx, stripe, thinSub);
        break;
      }

      case "customer.subscription.deleted": {
        const thinSub = event.data.object as Stripe.Subscription;
        if (!thinSub.id) {
          console.error(
            "Thin customer.subscription.deleted event missing subscription id",
          );
          break;
        }
        await handleSubscriptionDeleted(ctx, stripe, thinSub);
        break;
      }

      default:
        console.log(`Unhandled THIN event type: ${event.type}`);
    }

    return { received: true };
  },
});

/**
 * Handle checkout.session.completed event
 */
async function handleCheckoutSessionCompleted(
  ctx: any,
  session: Stripe.Checkout.Session
) {
  const userId = session.metadata?.userId;
  if (!userId) {
    console.error("No userId in session metadata");
    return;
  }

  // Get customer ID from session
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  
  // Store customer ID in user record if not already stored
  if (customerId) {
    await ctx.runMutation((internal as any).paymentInternal.updateUserStripeCustomerId, {
      userId: userId as any,
      stripeCustomerId: customerId,
    });
  }

  // Update checkout session
  // Using type assertion until API regenerates
  await ctx.runMutation((internal as any).paymentInternal.updateCheckoutSession, {
    sessionId: session.id,
    customerId: customerId,
    subscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
    status: "complete",
  });

  // If there's a subscription, fetch it and create/update subscription record
  if (session.subscription) {
    const subscriptionId = typeof session.subscription === "string" 
      ? session.subscription 
      : session.subscription.id;

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) return;

    const stripe = new Stripe(stripeSecretKey);
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price"],
    });

    // Get existing subscription to use as fallback for dates
    const existingSub = await ctx.runQuery((internal as any).paymentInternal.getMySubscriptionForUser, {
      userId: userId as any,
    });

    // Get dates safely
    const dates = getSubscriptionDates(subscription, existingSub ? {
      currentPeriodStart: existingSub.currentPeriodStart,
      currentPeriodEnd: existingSub.currentPeriodEnd,
    } : undefined);
    const intervalInfo = getSubscriptionInterval(subscription);

    // Using type assertion until API regenerates
    await ctx.runMutation((internal as any).paymentInternal.upsertSubscription, {
      subscriptionId: subscription.id,
      userId: userId as any,
      customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      status: subscription.status as any,
      currentPeriodStart: dates.currentPeriodStart,
      currentPeriodEnd: dates.currentPeriodEnd,
      cancelAtPeriodEnd: (subscription as any).cancel_at_period_end || false,
      canceledAt: (subscription as any).canceled_at ? convertStripeTimestamp((subscription as any).canceled_at, "canceled_at") : undefined,
      interval: intervalInfo?.interval,
      intervalCount: intervalInfo?.intervalCount,
    });
  }
}

/**
 * Handle subscription created/updated events
 */
async function handleSubscriptionUpdate(
  ctx: any,
  stripe: Stripe,
  subscription: Stripe.Subscription
) {
  // Re-retrieve with expand so we get billing interval (year vs month) from price
  const subscriptionExpanded = await stripe.subscriptions.retrieve(subscription.id, {
    expand: ["items.data.price"],
  });

  const customerId = typeof subscriptionExpanded.customer === "string"
    ? subscriptionExpanded.customer
    : subscriptionExpanded.customer.id;

  const checkoutSessions = await ctx.runQuery((internal as any).paymentInternal.getCheckoutSessionByCustomerId, {
    customerId,
  });

  if (!checkoutSessions || checkoutSessions.length === 0) {
    console.error(`No checkout session found for customer ${customerId}`);
    return;
  }

  const userId = checkoutSessions[0].userId;

  const existingSub = await ctx.runQuery((internal as any).paymentInternal.getMySubscriptionForUser, {
    userId: userId,
  });

  const dates = getSubscriptionDates(subscriptionExpanded, existingSub ? {
    currentPeriodStart: existingSub.currentPeriodStart,
    currentPeriodEnd: existingSub.currentPeriodEnd,
  } : undefined);
  const intervalInfo = getSubscriptionInterval(subscriptionExpanded);

  await ctx.runMutation((internal as any).paymentInternal.upsertSubscription, {
    subscriptionId: subscriptionExpanded.id,
    userId: userId,
    customerId: customerId,
    status: subscriptionExpanded.status as any,
    currentPeriodStart: dates.currentPeriodStart,
    currentPeriodEnd: dates.currentPeriodEnd,
    cancelAtPeriodEnd: (subscriptionExpanded as any).cancel_at_period_end || false,
    canceledAt: (subscriptionExpanded as any).canceled_at ? convertStripeTimestamp((subscriptionExpanded as any).canceled_at, "canceled_at") : undefined,
    interval: intervalInfo?.interval,
    intervalCount: intervalInfo?.intervalCount,
  });
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(
  ctx: any,
  stripe: Stripe,
  subscription: Stripe.Subscription
) {
  // Re-retrieve with expand so we have consistent shape; interval preserved from existingSub if needed
  const subscriptionExpanded = await stripe.subscriptions.retrieve(subscription.id, {
    expand: ["items.data.price"],
  });

  const customerId = typeof subscriptionExpanded.customer === "string"
    ? subscriptionExpanded.customer
    : subscriptionExpanded.customer.id;

  const checkoutSessions = await ctx.runQuery((internal as any).paymentInternal.getCheckoutSessionByCustomerId, {
    customerId,
  });

  if (!checkoutSessions || checkoutSessions.length === 0) {
    console.error(`No checkout session found for customer ${customerId}`);
    return;
  }

  const userId = checkoutSessions[0].userId;

  const existingSub = await ctx.runQuery((internal as any).paymentInternal.getMySubscriptionForUser, {
    userId: userId,
  });

  const dates = getSubscriptionDates(subscriptionExpanded, existingSub ? {
    currentPeriodStart: existingSub.currentPeriodStart,
    currentPeriodEnd: existingSub.currentPeriodEnd,
  } : undefined);
  const intervalInfo = getSubscriptionInterval(subscriptionExpanded);

  await ctx.runMutation((internal as any).paymentInternal.upsertSubscription, {
    subscriptionId: subscriptionExpanded.id,
    userId: userId,
    customerId: customerId,
    status: "canceled" as const,
    currentPeriodStart: dates.currentPeriodStart,
    currentPeriodEnd: dates.currentPeriodEnd,
    cancelAtPeriodEnd: false,
    canceledAt: (subscriptionExpanded as any).canceled_at ? convertStripeTimestamp((subscriptionExpanded as any).canceled_at, "canceled_at") : Date.now(),
    interval: intervalInfo?.interval ?? existingSub?.interval,
    intervalCount: intervalInfo?.intervalCount ?? existingSub?.intervalCount,
  });
}


