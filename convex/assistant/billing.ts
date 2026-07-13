"use node";

import { ConvexError, v } from "convex/values";
import Stripe from "stripe";
import { internalAction } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { billingPortalResultValidator } from "./validators";

const ADMIN_GRANT_SUBSCRIPTION_ID_PREFIX = "admin-grant-";

export const createBillingPortalForUser = internalAction({
  args: {
    userId: v.id("users"),
  },
  returns: billingPortalResultValidator,
  handler: async (ctx, args) => {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error("Billing portal is unavailable right now.");
    }

    const stripe = new Stripe(stripeSecretKey);
    const userWithCustomer = await ctx.runQuery(internal.paymentInternal.getUserWithCustomer, {
      userId: args.userId,
    });

    let customerId: string;

    if (!userWithCustomer?.stripeCustomerId) {
      const subscription = await ctx.runQuery(internal.paymentInternal.getMySubscriptionForUser, {
        userId: args.userId,
      });

      if (!subscription) {
        throw new Error("No billing account found for this user.");
      }

      if (subscription.subscriptionId.startsWith(ADMIN_GRANT_SUBSCRIPTION_ID_PREFIX)) {
        throw new ConvexError({
          code: "ADMIN_GRANTED_SUBSCRIPTION",
          message: "Your subscription was granted by an admin. To change it, contact support.",
        });
      }

      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.subscriptionId);
      customerId =
        typeof stripeSubscription.customer === "string"
          ? stripeSubscription.customer
          : stripeSubscription.customer.id;

      await ctx.runMutation(internal.paymentInternal.updateUserStripeCustomerId, {
        userId: args.userId,
        stripeCustomerId: customerId,
      });
    } else {
      customerId = userWithCustomer.stripeCustomerId;
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.PANEL_URL || "http://localhost:5173"}/payments`,
    });

    if (!portalSession.url) {
      throw new Error("Billing portal is unavailable right now.");
    }

    return { url: portalSession.url };
  },
});
