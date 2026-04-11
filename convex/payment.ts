"use node";

import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
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

type ConvexStripeSubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "unpaid"
  | "incomplete"
  | "trialing";

function normalizeStripeSubscriptionStatusForConvex(
  status: Stripe.Subscription.Status,
): ConvexStripeSubscriptionStatus {
  switch (status) {
    case "active":
    case "canceled":
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "trialing":
      return status;
    case "incomplete_expired":
      return "incomplete";
    case "paused":
      return "active";
    default:
      return "canceled";
  }
}

/** Stripe period fields are Unix seconds; only null/undefined/0 is "missing" (avoid `!` on timestamps). */
function coercePositiveUnixSeconds(value: unknown): number | null {
  if (typeof value === "bigint") {
    const n = Number(value);
    if (!Number.isNaN(n) && n > 0) {
      return n;
    }
    return null;
  }
  if (typeof value === "number" && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (!Number.isNaN(n) && n > 0) {
      return n;
    }
  }
  return null;
}

/**
 * Stripe often puts billing period on each subscription item; newer API shapes may omit
 * top-level `current_period_*` on the subscription. Read both so sync does not fall back
 * to stale DB dates.
 */
function extractCurrentPeriodUnixFromStripeSubscription(subscription: any): {
  start: number | null;
  end: number | null;
  source: "subscription" | "subscription_item_first" | "subscription_items_aggregate" | "none";
} {
  const topStart = coercePositiveUnixSeconds(
    subscription?.current_period_start ?? subscription?.currentPeriodStart,
  );
  const topEnd = coercePositiveUnixSeconds(
    subscription?.current_period_end ?? subscription?.currentPeriodEnd,
  );
  if (topStart !== null && topEnd !== null) {
    return { start: topStart, end: topEnd, source: "subscription" };
  }

  const items = subscription?.items?.data;
  if (!Array.isArray(items) || items.length === 0) {
    return { start: topStart, end: topEnd, source: "none" };
  }

  const first = items[0];
  const firstStart = coercePositiveUnixSeconds(
    first?.current_period_start ?? first?.currentPeriodStart,
  );
  const firstEnd = coercePositiveUnixSeconds(
    first?.current_period_end ?? first?.currentPeriodEnd,
  );
  if (firstStart !== null && firstEnd !== null) {
    return {
      start: firstStart,
      end: firstEnd,
      source: "subscription_item_first",
    };
  }

  let minStart: number | null = null;
  let maxEnd: number | null = null;
  for (const it of items) {
    const s = coercePositiveUnixSeconds(
      it?.current_period_start ?? it?.currentPeriodStart,
    );
    const e = coercePositiveUnixSeconds(it?.current_period_end ?? it?.currentPeriodEnd);
    if (s !== null && (minStart === null || s < minStart)) {
      minStart = s;
    }
    if (e !== null && (maxEnd === null || e > maxEnd)) {
      maxEnd = e;
    }
  }
  if (minStart !== null && maxEnd !== null) {
    return {
      start: minStart,
      end: maxEnd,
      source: "subscription_items_aggregate",
    };
  }

  return { start: topStart, end: topEnd, source: "none" };
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
  const extracted = extractCurrentPeriodUnixFromStripeSubscription(subscription);
  const currentPeriodStart = extracted.start;
  const currentPeriodEnd = extracted.end;

  // If dates are missing, use fallback logic
  if (currentPeriodStart === null || currentPeriodEnd === null) {
    console.warn("Subscription missing period dates (subscription + items), using fallback", {
      subscriptionId: subscription.id,
      status: subscription.status,
      hasExistingDates: !!existingDates,
      periodSourceAttempted: extracted.source,
      itemCount: Array.isArray(subscription?.items?.data)
        ? subscription.items.data.length
        : 0,
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
    const user = await ctx.runQuery(internal.paymentInternal.getUserById, {
      userId: userId as Id<"users">,
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
  ctx: ActionCtx,
  userId: Id<"users">,
  stripeSecretKey: string
): Promise<string> {
  // Get user email for Stripe customer
  const userFull = await ctx.runQuery(internal.paymentInternal.getUserFull, {
    userId,
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
      userId,
    },
  });

  // Store customer ID in database
  await ctx.runMutation(internal.paymentInternal.updateUserStripeCustomerId, {
    userId,
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
  handler: async (ctx): Promise<string> => {
    // Require user to be authenticated
    const { userId } = await requireUserAction(ctx);
    const userIdTyped = userId as Id<"users">;

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured. Please set it in your Convex environment variables.");
    }

    // Get user info
    const user = await ctx.runQuery(internal.paymentInternal.getUserById, {
      userId: userIdTyped,
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Check if user already has a Stripe customer ID
    const userWithCustomer: { _id: Id<"users">; stripeCustomerId?: string } | null =
      await ctx.runQuery(internal.paymentInternal.getUserWithCustomer, {
        userId: userIdTyped,
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
        return await createStripeCustomerForUser(ctx, userIdTyped, stripeSecretKey);
      }
    }

    // Create new customer
    return await createStripeCustomerForUser(ctx, userIdTyped, stripeSecretKey);
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
  handler: async (ctx, args): Promise<string> => {
    // Require user to be authenticated
    const { userId } = await requireUserAction(ctx);
    const userIdTyped = userId as Id<"users">;

    // Get Stripe secret key from environment
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured. Please set it in your Convex environment variables.");
    }

    // Get or create Stripe customer
    // First check if user already has a customer ID
    const userWithCustomer = await ctx.runQuery(internal.paymentInternal.getUserWithCustomer, {
      userId: userIdTyped,
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
        customerId = await createStripeCustomerForUser(ctx, userIdTyped, stripeSecretKey);
      }
    } else {
      // Create new Stripe customer
      customerId = await createStripeCustomerForUser(ctx, userIdTyped, stripeSecretKey);
    }

    // Get selected product/price from settings
    const paymentSettings: {
      selectedMonthlyPriceId: string;
      selectedYearlyPriceId?: string;
    } | null = await ctx.runQuery(internal.paymentInternal.getPaymentSettings);

    if (!paymentSettings) {
      throw new Error("No product/price configured. Please configure a product in the admin section.");
    }

    // Use provided priceId (yearly) or fall back to monthly (default)
    const allowedPriceIds: string[] = [
      paymentSettings.selectedMonthlyPriceId,
      paymentSettings.selectedYearlyPriceId,
    ].filter((id): id is string => !!id);
    const priceId: string =
      args.priceId && allowedPriceIds.includes(args.priceId)
        ? args.priceId
        : paymentSettings.selectedMonthlyPriceId ?? "";

    // Initialize Stripe client
    const stripe = new Stripe(stripeSecretKey);

    try {
      // Create checkout session with selected price and customer
      const session: Stripe.Checkout.Session = await stripe.checkout.sessions.create({
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
          userId: userIdTyped,
        },
      });

      if (!session.url || !session.id) {
        throw new Error("Failed to create checkout session URL");
      }

      // Store the checkout session in the database
      await ctx.runMutation(internal.paymentInternal.storeCheckoutSession, {
        sessionId: session.id,
        userId: userIdTyped,
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
    const userIdTyped = userId as Id<"users">;

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
      const userSubscription = await ctx.runQuery(internal.paymentInternal.getMySubscriptionForUser, {
        userId: userIdTyped,
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
      await ctx.runMutation(internal.paymentInternal.upsertSubscription, {
        subscriptionId: subscription.id,
        userId: userId as Id<"users">,
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
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; message: string; status?: string; subscriptionId?: string }> => {
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
    const targetUser = await ctx.runQuery(internal.paymentInternal.getUserWithCustomer, {
      userId: args.userId,
    });

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

    const anchor = await ctx.runQuery(
      internal.paymentInternal.getStripeSubscriptionAnchorForAdminSync,
      { userId: args.userId },
    );

    if (!anchor) {
      return {
        success: false,
        message: "No Stripe subscription record found for this user.",
        status: undefined,
        subscriptionId: undefined,
      };
    }

    if (!anchor.subscriptionId.startsWith("sub_")) {
      return {
        success: false,
        message: "This subscription is not managed by Stripe and cannot be refreshed.",
        status: undefined,
        subscriptionId: anchor.subscriptionId,
      };
    }

    const stripe = new Stripe(stripeSecretKey);

    try {
      const subscription = await resolveStripeSubscriptionForSync(
        stripe,
        anchor.subscriptionId,
      );

      const existingDates = {
        currentPeriodStart: anchor.currentPeriodStart,
        currentPeriodEnd: anchor.currentPeriodEnd,
      };
      await persistStripeSubscriptionForConvex(ctx, subscription, args.userId, existingDates);

      if (subscription.id !== anchor.subscriptionId) {
        const original = await stripe.subscriptions.retrieve(anchor.subscriptionId, {
          expand: ["items.data.price"],
        });
        await persistStripeSubscriptionForConvex(ctx, original, args.userId, existingDates);
      }

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

function stripeSubscriptionPeriodEndMs(sub: Stripe.Subscription): number | null {
  const { end } = extractCurrentPeriodUnixFromStripeSubscription(sub as any);
  if (end === null) {
    return null;
  }
  return end * 1000;
}

function stripeCustomerIdFromSubscription(sub: Stripe.Subscription): string | null {
  const customerRaw = sub.customer;
  if (typeof customerRaw === "string") {
    return customerRaw;
  }
  if (
    customerRaw &&
    typeof customerRaw === "object" &&
    "id" in customerRaw &&
    typeof (customerRaw as { id: unknown }).id === "string"
  ) {
    return (customerRaw as { id: string }).id;
  }
  return null;
}

/**
 * If the subscription on file is not the customer's current billable one, pick the best
 * active/trialing subscription on the same customer (new checkout after cancel, etc.).
 * Also used when nightly sync or admin refresh runs without webhooks.
 */
async function reboundToBetterStripeSubscriptionOnCustomer(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  inputSubscriptionId: string,
  triggerReason: string,
): Promise<Stripe.Subscription> {
  const customerId = stripeCustomerIdFromSubscription(subscription);
  if (!customerId) {
    console.log("[resolveStripeSubscriptionForSync]", {
      inputSubscriptionId,
      triggerReason,
      fixed: false,
      reason: "missing_customer_on_subscription",
    });
    return subscription;
  }

  const [activeList, trialingList] = await Promise.all([
    stripe.subscriptions.list({ customer: customerId, status: "active", limit: 20 }),
    stripe.subscriptions.list({ customer: customerId, status: "trialing", limit: 20 }),
  ]);

  const candidates = [...activeList.data, ...trialingList.data];
  if (candidates.length === 0) {
    console.log("[resolveStripeSubscriptionForSync]", {
      inputSubscriptionId,
      triggerReason,
      fixed: false,
      reason: "no_active_or_trialing_for_customer",
      customerId,
    });
    return subscription;
  }

  const score = (s: Stripe.Subscription) => {
    const statusWeight = s.status === "active" ? 2 : s.status === "trialing" ? 1 : 0;
    const { end } = extractCurrentPeriodUnixFromStripeSubscription(s as any);
    const periodEnd = end ?? 0;
    return statusWeight * 1e12 + periodEnd;
  };

  candidates.sort((a, b) => score(b) - score(a));
  const best = candidates[0];
  if (!best || best.id === subscription.id) {
    console.log("[resolveStripeSubscriptionForSync]", {
      inputSubscriptionId,
      triggerReason,
      fixed: false,
      reason: "best_candidate_same_as_input_or_missing",
      customerId,
      candidateCount: candidates.length,
    });
    return subscription;
  }

  const resolved = await stripe.subscriptions.retrieve(best.id, {
    expand: ["items.data.price"],
  });
  console.log("[resolveStripeSubscriptionForSync]", {
    inputSubscriptionId,
    triggerReason,
    fixed: true,
    reason: "rebound_to_other_subscription_on_same_customer",
    customerId,
    resolvedSubscriptionId: resolved.id,
    candidateCount: candidates.length,
  });
  return resolved;
}

/**
 * Prefer the subscription Stripe treats as current for this customer when the id we
 * have is canceled, unpaid, past_due, or still "active"/trialing with a lapsed period.
 */
async function resolveStripeSubscriptionForSync(
  stripe: Stripe,
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });

  if (subscription.status === "canceled") {
    return reboundToBetterStripeSubscriptionOnCustomer(
      stripe,
      subscription,
      subscriptionId,
      "input_canceled",
    );
  }

  if (subscription.status === "past_due" || subscription.status === "unpaid") {
    const rebounded = await reboundToBetterStripeSubscriptionOnCustomer(
      stripe,
      subscription,
      subscriptionId,
      "input_past_due_or_unpaid",
    );
    if (rebounded.id !== subscription.id) {
      return rebounded;
    }
    console.log("[resolveStripeSubscriptionForSync]", {
      inputSubscriptionId: subscriptionId,
      fixed: false,
      reason: "past_due_or_unpaid_no_other_subscription",
      stripeStatus: subscription.status,
    });
    return subscription;
  }

  if (subscription.status === "active" || subscription.status === "trialing") {
    const endMs = stripeSubscriptionPeriodEndMs(subscription);
    if (endMs !== null && endMs < Date.now()) {
      return reboundToBetterStripeSubscriptionOnCustomer(
        stripe,
        subscription,
        subscriptionId,
        "input_active_or_trialing_but_period_ended",
      );
    }
    return subscription;
  }

  return subscription;
}

async function persistStripeSubscriptionForConvex(
  ctx: ActionCtx,
  subscription: Stripe.Subscription,
  userId: Id<"users">,
  existingDates?: { currentPeriodStart: number; currentPeriodEnd: number },
): Promise<void> {
  const customerId = stripeCustomerIdFromSubscription(subscription);
  if (!customerId) {
    throw new Error(`Stripe subscription ${subscription.id} has no customer id`);
  }
  const dates = getSubscriptionDates(subscription, existingDates);
  const intervalInfo = getSubscriptionInterval(subscription);
  const canceledAtRaw = (subscription as { canceled_at?: number }).canceled_at;
  await ctx.runMutation(internal.paymentInternal.upsertSubscription, {
    subscriptionId: subscription.id,
    userId,
    customerId,
    status: normalizeStripeSubscriptionStatusForConvex(subscription.status),
    currentPeriodStart: dates.currentPeriodStart,
    currentPeriodEnd: dates.currentPeriodEnd,
    cancelAtPeriodEnd: (subscription as { cancel_at_period_end?: boolean }).cancel_at_period_end ?? false,
    canceledAt: canceledAtRaw
      ? convertStripeTimestamp(canceledAtRaw, "canceled_at")
      : undefined,
    interval: intervalInfo?.interval,
    intervalCount: intervalInfo?.intervalCount,
  });
}

/**
 * Internal action: sync all Stripe-backed subscription statuses from Stripe.
 * Used by the daily cron to keep subscription status, period dates, and cancel state in sync.
 *
 * Phase 1: each distinct `sub_*` row in Convex (resolve → upsert; if rebound, also upsert the original id).
 * Phase 2: every subscription on Stripe for each `users.stripeCustomerId` not already written this run
 * (covers new checkouts before a subscription row existed).
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
    const customerPairs = await ctx.runQuery(
      internal.paymentInternal.listUsersWithStripeCustomerIds,
      {},
    );

    const stripe = new Stripe(stripeSecretKey);
    let synced = 0;
    let errors = 0;
    const subscriptionIdsSyncedThisRun = new Set<string>();

    const recordOne = async (
      subscription: Stripe.Subscription,
      userId: Id<"users">,
      existingDates?: { currentPeriodStart: number; currentPeriodEnd: number },
    ) => {
      await persistStripeSubscriptionForConvex(ctx, subscription, userId, existingDates);
      subscriptionIdsSyncedThisRun.add(subscription.id);
      synced += 1;
    };

    for (const row of list) {
      if (subscriptionIdsSyncedThisRun.has(row.subscriptionId)) {
        continue;
      }
      try {
        const resolved = await resolveStripeSubscriptionForSync(stripe, row.subscriptionId);
        await recordOne(resolved, row.userId, {
          currentPeriodStart: row.currentPeriodStart,
          currentPeriodEnd: row.currentPeriodEnd,
        });

        if (resolved.id !== row.subscriptionId) {
          const original = await stripe.subscriptions.retrieve(row.subscriptionId, {
            expand: ["items.data.price"],
          });
          await recordOne(original, row.userId, {
            currentPeriodStart: row.currentPeriodStart,
            currentPeriodEnd: row.currentPeriodEnd,
          });
        }
      } catch (err) {
        console.error(`Failed to sync subscription ${row.subscriptionId}:`, err);
        errors += 1;
      }
    }

    for (const { userId, customerId } of customerPairs) {
      try {
        let startingAfter: string | undefined;
        for (;;) {
          const page = await stripe.subscriptions.list({
            customer: customerId,
            status: "all",
            limit: 100,
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          });
          for (const thin of page.data) {
            if (subscriptionIdsSyncedThisRun.has(thin.id)) {
              continue;
            }
            const full = await stripe.subscriptions.retrieve(thin.id, {
              expand: ["items.data.price"],
            });
            await recordOne(full, userId, undefined);
          }
          if (!page.has_more || page.data.length === 0) {
            break;
          }
          startingAfter = page.data[page.data.length - 1]!.id;
        }
      } catch (err) {
        console.error(
          `Failed customer subscription scan for user ${userId} customer ${customerId}:`,
          err,
        );
        errors += 1;
      }
    }

    if (list.length > 0 || customerPairs.length > 0) {
      console.log(
        `[syncAllSubscriptionsFromStripe] complete: ${synced} upserts, ${subscriptionIdsSyncedThisRun.size} distinct Stripe subscription ids, ${errors} errors`,
      );
    }
    return { synced, errors };
  },
});

function stripeResourceId(
  resource: string | { id?: string } | null | undefined,
): string | undefined {
  if (!resource) return undefined;
  if (typeof resource === "string") return resource;
  if (typeof resource === "object" && typeof resource.id === "string") {
    return resource.id;
  }
  return undefined;
}

/** Prefer PaymentIntent id; fallback to invoice id, subscription id, or checkout session id. */
function resolveTransactionIdFromCheckoutSession(session: Stripe.Checkout.Session): string {
  const pi = stripeResourceId(session.payment_intent as string | { id?: string } | null);
  if (pi) return pi;

  const inv = session.invoice;
  if (inv && typeof inv === "object" && "payment_intent" in inv) {
    const pip = (inv as { payment_intent?: string | { id?: string } | null }).payment_intent;
    const pipId = stripeResourceId(pip as string | { id?: string } | null);
    if (pipId) return pipId;
  }
  if (typeof inv === "string") return inv;

  const sub = session.subscription;
  const subId = stripeResourceId(sub as string | { id?: string } | null);
  if (subId) return subId;

  return session.id;
}

function buildPurchaseAnalyticsFromLineItems(
  session: Stripe.Checkout.Session,
  lineItems: Stripe.LineItem[],
): {
  orderId: string;
  transactionId: string;
  contentIds: string[];
  contents: Array<{ id: string; quantity: number; item_price: number }>;
  numItems: number;
  value: number;
  currency: string;
} {
  const orderId = session.id;
  const transactionId = resolveTransactionIdFromCheckoutSession(session);

  const contentIds: string[] = [];
  const contents: Array<{ id: string; quantity: number; item_price: number }> = [];
  let totalMinor = 0;
  let numItems = 0;
  let currency = "usd";

  for (const li of lineItems) {
    const price = li.price;
    if (!price) continue;
    const priceObj = typeof price === "string" ? null : price;
    if (!priceObj || !("id" in priceObj)) continue;
    const pid = priceObj.id;
    const qty = li.quantity ?? 1;
    const unitMinor = priceObj.unit_amount ?? 0;
    totalMinor += unitMinor * qty;
    numItems += qty;
    contentIds.push(pid);
    contents.push({
      id: pid,
      quantity: qty,
      item_price: unitMinor / 100,
    });
    if (priceObj.currency) {
      currency = priceObj.currency.toLowerCase();
    }
  }

  return {
    orderId,
    transactionId,
    contentIds,
    contents,
    numItems,
    value: totalMinor / 100,
    currency,
  };
}

/**
 * Manually sync subscription status from Stripe
 * Useful when webhooks are not set up yet
 * Call this after user redirects from Stripe checkout
 */
export const syncSubscriptionStatus = action({
  args: {
    sessionId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    subscriptionId: v.optional(v.string()),
    status: v.optional(v.string()),
    orderId: v.string(),
    transactionId: v.string(),
    contentIds: v.array(v.string()),
    contents: v.array(
      v.object({
        id: v.string(),
        quantity: v.number(),
        item_price: v.number(),
      }),
    ),
    numItems: v.number(),
    value: v.number(),
    currency: v.string(),
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
      // Retrieve the checkout session from Stripe (expand for GTM transaction id resolution)
      const session = await stripe.checkout.sessions.retrieve(args.sessionId, {
        expand: ["subscription", "payment_intent", "invoice", "invoice.payment_intent"],
      });

      // Check if session exists in our database
      const existingSession = await ctx.runQuery(internal.paymentInternal.getCheckoutSessionBySessionId, {
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
        await ctx.runMutation(internal.paymentInternal.updateUserStripeCustomerId, {
          userId: userId as Id<"users">,
          stripeCustomerId: customerId,
        });
      }

      // Update checkout session status
      await ctx.runMutation(internal.paymentInternal.updateCheckoutSession, {
        sessionId: session.id,
        customerId: customerId,
        subscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
        status: session.payment_status === "paid" ? "complete" : "expired",
      });

      const { data: checkoutLineItems } = await stripe.checkout.sessions.listLineItems(args.sessionId, {
        limit: 100,
        expand: ["data.price"],
      });
      const purchase = buildPurchaseAnalyticsFromLineItems(session, checkoutLineItems);

      // If there's a subscription, fetch and update it
      if (session.subscription) {
        const subscriptionId = typeof session.subscription === "string" 
          ? session.subscription 
          : session.subscription.id;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items.data.price"],
        });

        // Get existing subscription to use as fallback for dates
        const existingSub = await ctx.runQuery(internal.paymentInternal.getMySubscriptionForUser, {
          userId: existingSession.userId,
        });

        // Get dates safely
        const dates = getSubscriptionDates(subscription, existingSub ? {
          currentPeriodStart: existingSub.currentPeriodStart,
          currentPeriodEnd: existingSub.currentPeriodEnd,
        } : undefined);
        const intervalInfo = getSubscriptionInterval(subscription);

        await ctx.runMutation(internal.paymentInternal.upsertSubscription, {
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
          ...purchase,
        };
      }

      return {
        success: true,
        subscriptionId: undefined,
        status: undefined,
        ...purchase,
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
      const subscription = await ctx.runQuery(internal.paymentInternal.getMySubscriptionForUser, {
        userId: userId as Id<"users">,
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
      await ctx.runMutation(internal.paymentInternal.upsertSubscription, {
        subscriptionId: updatedSubscription.id,
        userId: userId as Id<"users">,
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
      const subscription = await ctx.runQuery(internal.paymentInternal.getMySubscriptionForUser, {
        userId: userId as Id<"users">,
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
      await ctx.runMutation(internal.paymentInternal.upsertSubscription, {
        subscriptionId: updatedSubscription.id,
        userId: userId as Id<"users">,
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
      const userWithCustomer = await ctx.runQuery(internal.paymentInternal.getUserWithCustomer, {
        userId: userId as Id<"users">,
      });

      let customerId: string;

      if (!userWithCustomer?.stripeCustomerId) {
        // Try to get from subscription if customer ID not stored
        const subscription = await ctx.runQuery(internal.paymentInternal.getMySubscriptionForUser, {
          userId: userId as Id<"users">,
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
        await ctx.runMutation(internal.paymentInternal.updateUserStripeCustomerId, {
          userId: userId as Id<"users">,
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
          const subscription = await ctx.runQuery(internal.paymentInternal.getMySubscriptionForUser, {
            userId: userId as Id<"users">,
          });
          if (subscription?.subscriptionId.startsWith(ADMIN_GRANT_SUBSCRIPTION_ID_PREFIX)) {
            await ctx.runMutation(internal.paymentInternal.clearUserStripeCustomerId, {
              userId: userId as Id<"users">,
            });
            throw new ConvexError({ code: "ADMIN_GRANTED_SUBSCRIPTION", message: "Your subscription was granted by an admin. To change it, contact support." });
          }
          // Customer not found - likely Stripe account/token changed
          // Reset subscription status and clear customer ID
          console.log(`Customer ${customerId} not found in Stripe. Resetting subscription status.`);
          await ctx.runMutation(internal.paymentInternal.resetSubscriptionStatus, {
            userId: userId as Id<"users">,
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
    await ctx.runMutation(internal.paymentInternal.updateUserStripeCustomerId, {
      userId: userId as Id<"users">,
      stripeCustomerId: customerId,
    });
  }

  // Update checkout session
  // Using type assertion until API regenerates
  await ctx.runMutation(internal.paymentInternal.updateCheckoutSession, {
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
    const existingSub = await ctx.runQuery(internal.paymentInternal.getMySubscriptionForUser, {
      userId: userId as Id<"users">,
    });

    // Get dates safely
    const dates = getSubscriptionDates(subscription, existingSub ? {
      currentPeriodStart: existingSub.currentPeriodStart,
      currentPeriodEnd: existingSub.currentPeriodEnd,
    } : undefined);
    const intervalInfo = getSubscriptionInterval(subscription);

    // Using type assertion until API regenerates
    await ctx.runMutation(internal.paymentInternal.upsertSubscription, {
      subscriptionId: subscription.id,
      userId: userId as Id<"users">,
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

  const checkoutSessions = await ctx.runQuery(internal.paymentInternal.getCheckoutSessionByCustomerId, {
    customerId,
  });

  if (!checkoutSessions || checkoutSessions.length === 0) {
    console.error(`No checkout session found for customer ${customerId}`);
    return;
  }

  const userId = checkoutSessions[0].userId;

  const existingSub = await ctx.runQuery(internal.paymentInternal.getMySubscriptionForUser, {
    userId: userId as Id<"users">,
  });

  const dates = getSubscriptionDates(subscriptionExpanded, existingSub ? {
    currentPeriodStart: existingSub.currentPeriodStart,
    currentPeriodEnd: existingSub.currentPeriodEnd,
  } : undefined);
  const intervalInfo = getSubscriptionInterval(subscriptionExpanded);

  await ctx.runMutation(internal.paymentInternal.upsertSubscription, {
    subscriptionId: subscriptionExpanded.id,
    userId: userId as Id<"users">,
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

  const checkoutSessions = await ctx.runQuery(internal.paymentInternal.getCheckoutSessionByCustomerId, {
    customerId,
  });

  if (!checkoutSessions || checkoutSessions.length === 0) {
    console.error(`No checkout session found for customer ${customerId}`);
    return;
  }

  const userId = checkoutSessions[0].userId;

  const existingSub = await ctx.runQuery(internal.paymentInternal.getMySubscriptionForUser, {
    userId: userId as Id<"users">,
  });

  const dates = getSubscriptionDates(subscriptionExpanded, existingSub ? {
    currentPeriodStart: existingSub.currentPeriodStart,
    currentPeriodEnd: existingSub.currentPeriodEnd,
  } : undefined);
  const intervalInfo = getSubscriptionInterval(subscriptionExpanded);

  await ctx.runMutation(internal.paymentInternal.upsertSubscription, {
    subscriptionId: subscriptionExpanded.id,
    userId: userId as Id<"users">,
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


