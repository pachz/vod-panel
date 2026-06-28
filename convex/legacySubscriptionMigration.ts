import { internalMutation, internalQuery, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { requireUser } from "./utils/auth";
import { pickPrimarySubscriptionForUserDisplay } from "./paymentInternal";
import { SUBSCRIPTION_MODEL, usesPackageSubscriptionModel } from "../shared/subscriptionModel";
import { internal } from "./_generated/api";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export type LegacyMigrationSegment =
  | "stripe_monthly"
  | "stripe_yearly"
  | "admin_manual"
  | "stripe_unknown"
  | "already_migrated";

const migrationUserRowValidator = v.object({
  userId: v.id("users"),
  userName: v.string(),
  userEmail: v.string(),
  subscriptionDocId: v.id("subscriptions"),
  subscriptionId: v.string(),
  status: v.string(),
  interval: v.union(v.string(), v.null()),
  stripePriceId: v.union(v.string(), v.null()),
  currentPeriodEnd: v.number(),
  legacyMigrationStatus: v.union(v.literal("migrated"), v.null()),
  assignedPlanId: v.union(v.id("subscriptionPlans"), v.null()),
  assignedPlanName: v.union(v.string(), v.null()),
  segment: v.union(
    v.literal("stripe_monthly"),
    v.literal("stripe_yearly"),
    v.literal("admin_manual"),
    v.literal("stripe_unknown"),
    v.literal("already_migrated"),
  ),
  legacyPlanName: v.string(),
  amountCents: v.union(v.number(), v.null()),
  currency: v.union(v.string(), v.null()),
  cancelAtPeriodEnd: v.boolean(),
});

const planPickerValidator = v.object({
  _id: v.id("subscriptionPlans"),
  name: v.string(),
  billingInterval: v.union(v.literal("month"), v.literal("year")),
  isHidden: v.boolean(),
  isActive: v.boolean(),
});

function classifyLegacySubscription(
  user: Doc<"users">,
  sub: Doc<"subscriptions">,
  nowMs: number,
  monthlyPriceId: string | undefined,
  yearlyPriceId: string | undefined,
): LegacyMigrationSegment | null {
  const hasAccess =
    ACTIVE_SUBSCRIPTION_STATUSES.has(sub.status) && sub.currentPeriodEnd >= nowMs;

  if (!hasAccess) {
    return null;
  }

  if (sub.legacyMigrationStatus === "migrated") {
    return "already_migrated";
  }

  if (sub.subscriptionId.startsWith("admin-grant-")) {
    return usesPackageSubscriptionModel(user) ? "already_migrated" : "admin_manual";
  }

  if (!sub.subscriptionId.startsWith("sub_")) {
    return null;
  }

  if (usesPackageSubscriptionModel(user) && sub.planId) {
    return "already_migrated";
  }

  if (
    (monthlyPriceId && sub.stripePriceId === monthlyPriceId) ||
    sub.interval === "month"
  ) {
    return "stripe_monthly";
  }

  if (
    (yearlyPriceId && sub.stripePriceId === yearlyPriceId) ||
    sub.interval === "year"
  ) {
    return "stripe_yearly";
  }

  return "stripe_unknown";
}

function resolveLegacyPlanName(
  segment: LegacyMigrationSegment,
  paymentSettings: Doc<"paymentSettings"> | null,
  assignedPlanName: string | null,
): string {
  if (segment === "already_migrated" && assignedPlanName) {
    return assignedPlanName;
  }

  const productName = paymentSettings?.productName?.trim();
  switch (segment) {
    case "stripe_monthly":
      return productName ? `${productName} (Monthly)` : "Legacy Stripe Monthly";
    case "stripe_yearly":
      return productName ? `${productName} (Yearly)` : "Legacy Stripe Yearly";
    case "admin_manual":
      return "Admin manual grant";
    case "stripe_unknown":
      return productName ? `${productName} (Stripe)` : "Legacy Stripe (unclassified)";
    case "already_migrated":
      return assignedPlanName ?? "Migrated package plan";
  }
}

function resolveLegacyAmount(
  segment: LegacyMigrationSegment,
  sub: Doc<"subscriptions">,
  paymentSettings: Doc<"paymentSettings"> | null,
  assignedPlan: Doc<"subscriptionPlans"> | null,
): { amountCents: number | null; currency: string | null } {
  if (segment === "already_migrated" && assignedPlan) {
    return {
      amountCents: assignedPlan.priceAmount,
      currency: assignedPlan.priceCurrency,
    };
  }

  if (!paymentSettings) {
    return { amountCents: null, currency: null };
  }

  const monthlyPriceId = paymentSettings.selectedPriceId;
  const yearlyPriceId = paymentSettings.selectedYearlyPriceId;

  if (
    segment === "stripe_monthly" ||
    (sub.stripePriceId && sub.stripePriceId === monthlyPriceId)
  ) {
    return {
      amountCents: paymentSettings.priceAmount,
      currency: paymentSettings.priceCurrency,
    };
  }

  if (
    segment === "stripe_yearly" ||
    (sub.stripePriceId && yearlyPriceId && sub.stripePriceId === yearlyPriceId)
  ) {
    return {
      amountCents: paymentSettings.yearlyPriceAmount ?? null,
      currency: paymentSettings.yearlyPriceCurrency ?? paymentSettings.priceCurrency,
    };
  }

  if (segment === "admin_manual") {
    return { amountCents: null, currency: null };
  }

  return { amountCents: null, currency: null };
}

async function buildMigrationOverview(ctx: { db: import("./_generated/server").QueryCtx["db"] }) {
  const nowMs = Date.now();
  const paymentSettings = await ctx.db.query("paymentSettings").order("desc").first();
  const monthlyPriceId = paymentSettings?.selectedPriceId;
  const yearlyPriceId = paymentSettings?.selectedYearlyPriceId;

  const users = await ctx.db
    .query("users")
    .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
    .collect();

  const segments: Record<LegacyMigrationSegment, Array<{
    userId: Id<"users">;
    userName: string;
    userEmail: string;
    subscriptionDocId: Id<"subscriptions">;
    subscriptionId: string;
    status: string;
    interval: string | null;
    stripePriceId: string | null;
    currentPeriodEnd: number;
    legacyMigrationStatus: "migrated" | null;
    assignedPlanId: Id<"subscriptionPlans"> | null;
    assignedPlanName: string | null;
    segment: LegacyMigrationSegment;
    legacyPlanName: string;
    amountCents: number | null;
    currency: string | null;
    cancelAtPeriodEnd: boolean;
  }>> = {
    stripe_monthly: [],
    stripe_yearly: [],
    admin_manual: [],
    stripe_unknown: [],
    already_migrated: [],
  };

  for (const user of users) {
    if (user.isGod) {
      continue;
    }

    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .collect();
    const primary = pickPrimarySubscriptionForUserDisplay(subs, nowMs);
    if (!primary) {
      continue;
    }

    const segment = classifyLegacySubscription(
      user,
      primary,
      nowMs,
      monthlyPriceId,
      yearlyPriceId,
    );
    if (!segment) {
      continue;
    }

    const assignedPlan =
      primary.planId != null ? await ctx.db.get(primary.planId) : null;
    const assignedPlanName = assignedPlan?.name ?? null;
    const { amountCents, currency } = resolveLegacyAmount(
      segment,
      primary,
      paymentSettings,
      assignedPlan,
    );

    segments[segment].push({
      userId: user._id,
      userName: user.name ?? "",
      userEmail: user.email ?? "",
      subscriptionDocId: primary._id,
      subscriptionId: primary.subscriptionId,
      status: primary.status,
      interval: primary.interval ?? null,
      stripePriceId: primary.stripePriceId ?? null,
      currentPeriodEnd: primary.currentPeriodEnd,
      legacyMigrationStatus: primary.legacyMigrationStatus ?? null,
      assignedPlanId: primary.planId ?? null,
      assignedPlanName,
      segment,
      legacyPlanName: resolveLegacyPlanName(segment, paymentSettings, assignedPlanName),
      amountCents,
      currency,
      cancelAtPeriodEnd: primary.cancelAtPeriodEnd,
    });
  }

  const plans = await ctx.db.query("subscriptionPlans").collect();
  const planOptions = plans
    .filter((plan) => plan.deletedAt === undefined)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((plan) => ({
      _id: plan._id,
      name: plan.name,
      billingInterval: plan.billingInterval,
      isHidden: plan.isHidden === true,
      isActive: plan.isActive,
    }));

  return { segments, plans: planOptions, nowMs };
}

export const getLegacyMigrationOverview = query({
  args: {},
  returns: v.object({
    segments: v.object({
      stripe_monthly: v.array(migrationUserRowValidator),
      stripe_yearly: v.array(migrationUserRowValidator),
      admin_manual: v.array(migrationUserRowValidator),
      stripe_unknown: v.array(migrationUserRowValidator),
      already_migrated: v.array(migrationUserRowValidator),
    }),
    plans: v.array(planPickerValidator),
  }),
  handler: async (ctx) => {
    await requireUser(ctx, { requireTech: true });
    const { segments, plans } = await buildMigrationOverview(ctx);
    return { segments, plans };
  },
});

async function getSegmentRows(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  segment: LegacyMigrationSegment,
) {
  const { segments } = await buildMigrationOverview(ctx);
  return segments[segment];
}

export const listSegmentForMigrationInternal = internalQuery({
  args: {
    segment: v.union(
      v.literal("stripe_monthly"),
      v.literal("stripe_yearly"),
      v.literal("stripe_unknown"),
    ),
  },
  returns: v.array(migrationUserRowValidator),
  handler: async (ctx, args) => {
    return await getSegmentRows(ctx, args.segment);
  },
});

export const getSubscriptionForMigrationInternal = internalQuery({
  args: { subscriptionDocId: v.id("subscriptions") },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      subscriptionId: v.string(),
      legacyMigrationStatus: v.union(v.literal("migrated"), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionDocId);
    if (!sub) {
      return null;
    }
    return {
      userId: sub.userId,
      subscriptionId: sub.subscriptionId,
      legacyMigrationStatus: sub.legacyMigrationStatus ?? null,
    };
  },
});
async function applyLegacyPackageMigration(
  ctx: import("./_generated/server").MutationCtx,
  args: {
    userId: Id<"users">;
    subscriptionDocId: Id<"subscriptions">;
    targetPlanId: Id<"subscriptionPlans">;
    cancelAtPeriodEnd?: boolean;
  },
) {
  const user = await ctx.db.get(args.userId);
  if (!user || user.deletedAt) {
    throw new ConvexError({ code: "NOT_FOUND", message: "User not found." });
  }

  const sub = await ctx.db.get(args.subscriptionDocId);
  if (!sub || sub.userId !== args.userId) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Subscription not found." });
  }

  if (sub.legacyMigrationStatus === "migrated") {
    throw new ConvexError({
      code: "ALREADY_MIGRATED",
      message: "Subscription was already migrated.",
    });
  }

  const plan = await ctx.db.get(args.targetPlanId);
  if (!plan || plan.deletedAt !== undefined) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Target plan not found." });
  }

  const nowMs = Date.now();
  await ctx.db.patch(args.subscriptionDocId, {
    planId: args.targetPlanId,
    stripePriceId: plan.stripePriceId,
    interval: plan.billingInterval,
    intervalCount: 1,
    legacyMigrationStatus: "migrated",
    legacyMigratedAt: nowMs,
    ...(args.cancelAtPeriodEnd !== undefined && {
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
    }),
    updatedAt: nowMs,
  });

  await ctx.db.patch(args.userId, {
    subscriptionModel: SUBSCRIPTION_MODEL.PACKAGES,
  });

  await ctx.scheduler.runAfter(0, internal.mailchimp.syncUserToMailchimp, {
    userId: args.userId,
  });
}

export const applyLegacyPackageMigrationInternal = internalMutation({
  args: {
    userId: v.id("users"),
    subscriptionDocId: v.id("subscriptions"),
    targetPlanId: v.id("subscriptionPlans"),
    cancelAtPeriodEnd: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await applyLegacyPackageMigration(ctx, args);
    return null;
  },
});
