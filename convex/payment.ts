"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import Stripe from "stripe";

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
        success_url: `${process.env.SITE_URL || "http://localhost:5173"}/payments?success=true`,
        cancel_url: `${process.env.SITE_URL || "http://localhost:5173"}/payments?canceled=true`,
      });

      if (!session.url) {
        throw new Error("Failed to create checkout session URL");
      }

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

