import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";

/** Fixed tags we set on each audience member (others are left inactive). */
export const MAILCHIMP_MANAGED_TAGS = [
  "role-admin",
  "role-user",
  "signup-password",
  "signup-google",
  "payment-success",
  "subscription-active",
] as const;

/** Tag for active all-access / pre-packages subscriptions (no planId). */
export const PLAN_LEGACY_TAG = "plan-legacy";

export function planTagFromSlug(slug: string): string {
  return `plan-${slug}`;
}

export const buildMailchimpSyncPayload = internalQuery({
  args: {
    userId: v.id("users"),
    nowMs: v.number(),
  },
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      firstName: v.string(),
      isDeleted: v.boolean(),
      roleIsAdmin: v.boolean(),
      hasPassword: v.boolean(),
      hasGoogle: v.boolean(),
      hasSuccessfulPayment: v.boolean(),
      hasActiveSubscription: v.boolean(),
      /** Active plan tag when subscribed, e.g. plan-starter or plan-legacy. */
      activePlanTag: v.union(v.string(), v.null()),
      /** All plan-* tags we manage (activate one, deactivate the rest). */
      managedPlanTags: v.array(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return null;
    }

    const rawEmail = user.email?.trim();
    if (!rawEmail) {
      return null;
    }
    const email = rawEmail.toLowerCase();

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId))
      .collect();

    const hasPassword = accounts.some((a) => a.provider === "password");
    const hasGoogle = accounts.some((a) => a.provider === "google");

    const checkoutSessions = await ctx.db
      .query("checkoutSessions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect();

    const hasSuccessfulPayment = checkoutSessions.some((s) => s.status === "complete");

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();

    const hasActiveSubscription =
      !!subscription &&
      (subscription.status === "active" || subscription.status === "trialing") &&
      subscription.currentPeriodEnd >= args.nowMs;

    // Include soft-deleted plans so we can deactivate their tags after renames/removals.
    // eslint-disable-next-line @convex-dev/no-query-collect -- plans are a small bounded set
    const plans = await ctx.db.query("subscriptionPlans").collect();

    let activePlanTag: string | null = null;
    if (hasActiveSubscription && subscription) {
      if (subscription.planId) {
        const plan = await ctx.db.get(subscription.planId);
        activePlanTag = plan ? planTagFromSlug(plan.slug) : PLAN_LEGACY_TAG;
      } else {
        activePlanTag = PLAN_LEGACY_TAG;
      }
    }

    const managedPlanTags = [
      ...new Set([
        PLAN_LEGACY_TAG,
        ...plans.map((p) => planTagFromSlug(p.slug)),
        ...(activePlanTag ? [activePlanTag] : []),
      ]),
    ];

    const name = (user.name ?? "").trim();
    const firstName = name.split(/\s+/)[0] ?? "";

    return {
      email,
      firstName,
      isDeleted: !!user.deletedAt,
      roleIsAdmin: user.isGod === true,
      hasPassword,
      hasGoogle,
      hasSuccessfulPayment,
      hasActiveSubscription,
      activePlanTag,
      managedPlanTags,
    };
  },
});

export const listUsersPageForMailchimp = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("users"),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db.query("users").paginate(args.paginationOpts);
    return {
      page: result.page.map((u) => ({ _id: u._id })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const scheduleMailchimpSync = internalMutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.mailchimp.syncUserToMailchimp, {
      userId: args.userId,
    });
    return null;
  },
});

/**
 * One-time or manual full-audience sync. Run from Convex dashboard (internal) with `{}`.
 * Chains batches until all users are processed.
 */
export const triggerMailchimpAudienceSync = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.mailchimp.processMailchimpBackfillPage, {
      cursor: null,
    });
    return null;
  },
});
