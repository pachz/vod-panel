"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import Stripe from "stripe";
import { requireUserAction } from "./utils/auth";
import { internal } from "./_generated/api";

/**
 * Creates a Stripe checkout session for testing subscriptions.
 * This is an alpha feature for testing Stripe integration.
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

    // Initialize Stripe client
    const stripe = new Stripe(stripeSecretKey);

    try {
      // Create a test checkout session
      // For testing, we'll create a simple subscription checkout
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Test Subscription",
                description: "Test subscription for Stripe integration",
              },
              recurring: {
                interval: "month",
              },
              unit_amount: 999, // $9.99 in cents
            },
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

  // Update checkout session
  // Using type assertion until API regenerates
  await ctx.runMutation((internal as any).paymentInternal.updateCheckoutSession, {
    sessionId: session.id,
    customerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
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

    // Using type assertion until API regenerates
    await ctx.runMutation((internal as any).paymentInternal.upsertSubscription, {
      subscriptionId: subscription.id,
      userId: userId as any,
      customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      status: subscription.status as any,
      currentPeriodStart: (subscription as any).current_period_start * 1000, // Convert to milliseconds
      currentPeriodEnd: (subscription as any).current_period_end * 1000,
      cancelAtPeriodEnd: (subscription as any).cancel_at_period_end,
      canceledAt: (subscription as any).canceled_at ? (subscription as any).canceled_at * 1000 : undefined,
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

  // Using type assertion until API regenerates
  await ctx.runMutation((internal as any).paymentInternal.upsertSubscription, {
    subscriptionId: subscription.id,
    userId: userId,
    customerId: customerId,
    status: subscription.status as any,
    currentPeriodStart: (subscription as any).current_period_start * 1000,
    currentPeriodEnd: (subscription as any).current_period_end * 1000,
    cancelAtPeriodEnd: (subscription as any).cancel_at_period_end,
    canceledAt: (subscription as any).canceled_at ? (subscription as any).canceled_at * 1000 : undefined,
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

  // Using type assertion until API regenerates
  await ctx.runMutation((internal as any).paymentInternal.upsertSubscription, {
    subscriptionId: subscription.id,
    userId: userId,
    customerId: customerId,
    status: "canceled" as const,
    currentPeriodStart: (subscription as any).current_period_start * 1000,
    currentPeriodEnd: (subscription as any).current_period_end * 1000,
    cancelAtPeriodEnd: false,
    canceledAt: (subscription as any).canceled_at ? (subscription as any).canceled_at * 1000 : Date.now(),
  });
}


