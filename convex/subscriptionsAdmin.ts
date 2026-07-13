import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { requireUser } from "./utils/auth";

const subscriptionStatusValidator = v.union(
  v.literal("active"),
  v.literal("canceled"),
  v.literal("past_due"),
  v.literal("unpaid"),
  v.literal("incomplete"),
  v.literal("trialing"),
);

const subscriptionRowValidator = v.object({
  subscriptionDocId: v.id("subscriptions"),
  subscriptionId: v.string(),
  customerId: v.string(),
  userId: v.id("users"),
  userName: v.union(v.string(), v.null()),
  userEmail: v.union(v.string(), v.null()),
  status: subscriptionStatusValidator,
  planName: v.union(v.string(), v.null()),
  priceAmount: v.union(v.number(), v.null()),
  priceCurrency: v.union(v.string(), v.null()),
  interval: v.union(v.string(), v.null()),
  intervalCount: v.union(v.number(), v.null()),
  currentPeriodStart: v.number(),
  currentPeriodEnd: v.number(),
  cancelAtPeriodEnd: v.boolean(),
  canceledAt: v.union(v.number(), v.null()),
  isAdminGranted: v.boolean(),
  isStripeBacked: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

function resolveLegacyPrice(
  sub: Doc<"subscriptions">,
  paymentSettings: Doc<"paymentSettings"> | null,
): { priceAmount: number | null; priceCurrency: string | null; planName: string | null } {
  if (!paymentSettings) {
    return { priceAmount: null, priceCurrency: null, planName: null };
  }

  const productName = paymentSettings.productName?.trim();
  const monthlyPriceId = paymentSettings.selectedPriceId;
  const yearlyPriceId = paymentSettings.selectedYearlyPriceId;

  if (sub.stripePriceId === monthlyPriceId || sub.interval === "month") {
    return {
      priceAmount: paymentSettings.priceAmount,
      priceCurrency: paymentSettings.priceCurrency,
      planName: productName ? `${productName} (Monthly)` : "Legacy monthly",
    };
  }

  if (
    (yearlyPriceId && sub.stripePriceId === yearlyPriceId) ||
    sub.interval === "year"
  ) {
    return {
      priceAmount: paymentSettings.yearlyPriceAmount ?? null,
      priceCurrency: paymentSettings.yearlyPriceCurrency ?? paymentSettings.priceCurrency,
      planName: productName ? `${productName} (Yearly)` : "Legacy yearly",
    };
  }

  return {
    priceAmount: null,
    priceCurrency: null,
    planName: productName ? `${productName} (Stripe)` : "Legacy Stripe",
  };
}

async function enrichSubscriptionRow(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  sub: Doc<"subscriptions">,
  paymentSettings: Doc<"paymentSettings"> | null,
  planCache: Map<Id<"subscriptionPlans">, Doc<"subscriptionPlans"> | null>,
  userCache: Map<Id<"users">, Doc<"users"> | null>,
) {
  let user = userCache.get(sub.userId);
  if (user === undefined) {
    user = await ctx.db.get(sub.userId);
    userCache.set(sub.userId, user);
  }

  const isAdminGranted = sub.subscriptionId.startsWith("admin-grant-");
  const isStripeBacked = sub.subscriptionId.startsWith("sub_");

  let planName: string | null = null;
  let priceAmount: number | null = null;
  let priceCurrency: string | null = null;

  if (isAdminGranted) {
    planName = "Admin grant";
  } else if (sub.planId) {
    let plan = planCache.get(sub.planId);
    if (plan === undefined) {
      plan = await ctx.db.get(sub.planId);
      planCache.set(sub.planId, plan);
    }
    if (plan) {
      planName = plan.name;
      priceAmount = plan.priceAmount;
      priceCurrency = plan.priceCurrency;
    }
  } else if (isStripeBacked) {
    const legacy = resolveLegacyPrice(sub, paymentSettings);
    planName = legacy.planName;
    priceAmount = legacy.priceAmount;
    priceCurrency = legacy.priceCurrency;
  }

  return {
    subscriptionDocId: sub._id,
    subscriptionId: sub.subscriptionId,
    customerId: sub.customerId,
    userId: sub.userId,
    userName: user?.name?.trim() || null,
    userEmail: user?.email?.trim() || null,
    status: sub.status,
    planName,
    priceAmount,
    priceCurrency,
    interval: sub.interval ?? null,
    intervalCount: sub.intervalCount ?? null,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    canceledAt: sub.canceledAt ?? null,
    isAdminGranted,
    isStripeBacked,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
  };
}

export const listForTechAdmin = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(subscriptionStatusValidator),
    search: v.optional(v.string()),
  },
  returns: v.object({
    page: v.array(subscriptionRowValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireTech: true });

    const paymentSettings = await ctx.db.query("paymentSettings").order("desc").first();
    const planCache = new Map<Id<"subscriptionPlans">, Doc<"subscriptionPlans"> | null>();
    const userCache = new Map<Id<"users">, Doc<"users"> | null>();

    const searchTerm = args.search?.trim();
    if (searchTerm) {
      const matchedUsers = await ctx.db
        .query("users")
        .withSearchIndex("search_name", (q) =>
          q.search("name_search", searchTerm).eq("deletedAt", undefined),
        )
        .take(50);

      const matchedUserIds = new Set(matchedUsers.map((user) => user._id));
      const rows = [];

      for (const userId of matchedUserIds) {
        const subs = await ctx.db
          .query("subscriptions")
          .withIndex("userId", (q) => q.eq("userId", userId))
          .collect();

        for (const sub of subs) {
          if (args.status && sub.status !== args.status) {
            continue;
          }
          rows.push(
            await enrichSubscriptionRow(ctx, sub, paymentSettings, planCache, userCache),
          );
        }
      }

      rows.sort((a, b) => b.updatedAt - a.updatedAt);

      const start = args.paginationOpts.cursor
        ? Number.parseInt(args.paginationOpts.cursor, 10)
        : 0;
      const end = start + args.paginationOpts.numItems;
      const page = rows.slice(start, end);

      return {
        page,
        isDone: end >= rows.length,
        continueCursor: String(end),
      };
    }

    const result = args.status
      ? await ctx.db
          .query("subscriptions")
          .withIndex("status", (q) => q.eq("status", args.status!))
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db.query("subscriptions").order("desc").paginate(args.paginationOpts);

    const page = await Promise.all(
      result.page.map((sub) =>
        enrichSubscriptionRow(ctx, sub, paymentSettings, planCache, userCache),
      ),
    );

    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
