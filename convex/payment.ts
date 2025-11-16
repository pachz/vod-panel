"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
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
  
  const numTimestamp = typeof timestamp === "string" ? Number(timestamp) : timestamp;
  
  if (isNaN(numTimestamp) || numTimestamp <= 0) {
    throw new Error(`Invalid timestamp for ${fieldName}: ${timestamp}`);
  }
  
  return numTimestamp * 1000;
}

/**
 * Helper function to safely get subscription dates from Stripe subscription object
 * Handles missing dates gracefully by using fallback values
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
    if (existingDates?.currentPeriodStart && existingDates.currentPeriodStart > 0 &&
        existingDates?.currentPeriodEnd && existingDates.currentPeriodEnd > 0) {
      return {
        currentPeriodStart: existingDates.currentPeriodStart,
        currentPeriodEnd: existingDates.currentPeriodEnd,
      };
    }

    // Calculate defaults
    const createdTimestamp = subscription.created;
    const startDate = Date.now();
    const endDate = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days from now

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
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
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
            price: paymentSettings.selectedPriceId,
            quantity: 1,
          },
        ],
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
      // Get subscription from Stripe
      const subscription = await stripe.subscriptions.retrieve(args.subscriptionId);

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

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        // Get existing subscription to use as fallback for dates
        const existingSub = await ctx.runQuery((internal as any).paymentInternal.getMySubscriptionForUser, {
          userId: existingSession.userId,
        });

        // Get dates safely
        const dates = getSubscriptionDates(subscription, existingSub ? {
          currentPeriodStart: existingSub.currentPeriodStart,
          currentPeriodEnd: existingSub.currentPeriodEnd,
        } : undefined);

        await ctx.runMutation((internal as any).paymentInternal.upsertSubscription, {
          subscriptionId: subscription.id,
          userId: existingSession.userId,
          customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
          status: subscription.status as any,
          currentPeriodStart: dates.currentPeriodStart,
          currentPeriodEnd: dates.currentPeriodEnd,
          cancelAtPeriodEnd: (subscription as any).cancel_at_period_end || false,
          canceledAt: (subscription as any).canceled_at ? convertStripeTimestamp((subscription as any).canceled_at, "canceled_at") : undefined,
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

      // Update subscription in database
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

      // Update subscription in database
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
        throw new Error(`Customer ${customerId} not found in Stripe. Please contact support.`);
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
      throw new Error(
        error instanceof Error 
          ? `Failed to create customer portal session: ${error.message}`
          : "Failed to create customer portal session"
      );
    }
  },
});

/**
 * Webhook handler for Stripe events
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

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(ctx, session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(ctx, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(ctx, subscription);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
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
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Get existing subscription to use as fallback for dates
    const existingSub = await ctx.runQuery((internal as any).paymentInternal.getMySubscriptionForUser, {
      userId: userId as any,
    });

    // Get dates safely
    const dates = getSubscriptionDates(subscription, existingSub ? {
      currentPeriodStart: existingSub.currentPeriodStart,
      currentPeriodEnd: existingSub.currentPeriodEnd,
    } : undefined);

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
    });
  }
}

/**
 * Handle subscription created/updated events
 */
async function handleSubscriptionUpdate(
  ctx: any,
  subscription: Stripe.Subscription
) {
  // Get userId from checkout session metadata or find by customer ID
  const customerId = typeof subscription.customer === "string" 
    ? subscription.customer 
    : subscription.customer.id;

  // Find checkout session by customer ID to get userId
  // Using type assertion until API regenerates
  const checkoutSessions = await ctx.runQuery((internal as any).paymentInternal.getCheckoutSessionByCustomerId, {
    customerId,
  });

  if (!checkoutSessions || checkoutSessions.length === 0) {
    console.error(`No checkout session found for customer ${customerId}`);
    return;
  }

  const userId = checkoutSessions[0].userId;

  // Get existing subscription to use as fallback for dates
  const existingSub = await ctx.runQuery((internal as any).paymentInternal.getMySubscriptionForUser, {
    userId: userId,
  });

  // Get dates safely
  const dates = getSubscriptionDates(subscription, existingSub ? {
    currentPeriodStart: existingSub.currentPeriodStart,
    currentPeriodEnd: existingSub.currentPeriodEnd,
  } : undefined);

  // Using type assertion until API regenerates
  await ctx.runMutation((internal as any).paymentInternal.upsertSubscription, {
    subscriptionId: subscription.id,
    userId: userId,
    customerId: customerId,
    status: subscription.status as any,
    currentPeriodStart: dates.currentPeriodStart,
    currentPeriodEnd: dates.currentPeriodEnd,
    cancelAtPeriodEnd: (subscription as any).cancel_at_period_end || false,
    canceledAt: (subscription as any).canceled_at ? convertStripeTimestamp((subscription as any).canceled_at, "canceled_at") : undefined,
  });
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(
  ctx: any,
  subscription: Stripe.Subscription
) {
  const customerId = typeof subscription.customer === "string" 
    ? subscription.customer 
    : subscription.customer.id;

  // Using type assertion until API regenerates
  const checkoutSessions = await ctx.runQuery((internal as any).paymentInternal.getCheckoutSessionByCustomerId, {
    customerId,
  });

  if (!checkoutSessions || checkoutSessions.length === 0) {
    console.error(`No checkout session found for customer ${customerId}`);
    return;
  }

  const userId = checkoutSessions[0].userId;

  // Get existing subscription to use as fallback for dates
  const existingSub = await ctx.runQuery((internal as any).paymentInternal.getMySubscriptionForUser, {
    userId: userId,
  });

  // Get dates safely
  const dates = getSubscriptionDates(subscription, existingSub ? {
    currentPeriodStart: existingSub.currentPeriodStart,
    currentPeriodEnd: existingSub.currentPeriodEnd,
  } : undefined);

  // Using type assertion until API regenerates
  await ctx.runMutation((internal as any).paymentInternal.upsertSubscription, {
    subscriptionId: subscription.id,
    userId: userId,
    customerId: customerId,
    status: "canceled" as const,
    currentPeriodStart: dates.currentPeriodStart,
    currentPeriodEnd: dates.currentPeriodEnd,
    cancelAtPeriodEnd: false,
    canceledAt: (subscription as any).canceled_at ? convertStripeTimestamp((subscription as any).canceled_at, "canceled_at") : Date.now(),
  });
}


