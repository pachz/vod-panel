import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { pickPrimarySubscriptionForUserDisplay } from "../paymentInternal";
import {
  isPublicPlan,
  mapPlanForPaywall,
  paywallPlanValidator,
} from "../courseAccess";
import { usesPackageSubscriptionModel } from "../../shared/subscriptionModel";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export const personalTestPaywallPlanValidator = paywallPlanValidator;

export function planIncludesPersonalTests(
  plan: Pick<Doc<"subscriptionPlans">, "includesPersonalTests"> | null | undefined,
): boolean {
  return plan?.includesPersonalTests === true;
}

type PersonalTestAccessResult = {
  canAccess: boolean;
  usesPackageModel: boolean;
  paywallMode: "packages_subscribe" | "packages_upgrade" | null;
  currentPlanId: Id<"subscriptionPlans"> | null;
  plans: Array<Awaited<ReturnType<typeof mapPlanForPaywall>>>;
};

async function loadActiveSubscription(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  nowMs: number,
) {
  const subs = await ctx.db
    .query("subscriptions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  const subscription = pickPrimarySubscriptionForUserDisplay(subs, nowMs);
  const isActive =
    subscription !== null &&
    ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) &&
    subscription.currentPeriodEnd >= nowMs;

  return { subscription: isActive ? subscription : null, isActive };
}

export async function resolvePersonalTestAccess(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  nowMs: number,
): Promise<PersonalTestAccessResult> {
  const usesPackageModel = usesPackageSubscriptionModel(user);

  if (user.isGod) {
    return {
      canAccess: true,
      usesPackageModel,
      paywallMode: null,
      currentPlanId: null,
      plans: [],
    };
  }

  const { subscription, isActive } = await loadActiveSubscription(
    ctx,
    user._id,
    nowMs,
  );

  let currentPlanId: Id<"subscriptionPlans"> | null = null;
  if (isActive && subscription?.planId) {
    currentPlanId = subscription.planId;
    const plan = await ctx.db.get(subscription.planId);
    if (plan && plan.deletedAt === undefined && planIncludesPersonalTests(plan)) {
      return {
        canAccess: true,
        usesPackageModel,
        paywallMode: null,
        currentPlanId,
        plans: [],
      };
    }
  }

  const allPlans = await ctx.db
    .query("subscriptionPlans")
    .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
    .collect();

  const eligiblePlans = allPlans
    .filter((plan) => isPublicPlan(plan) && planIncludesPersonalTests(plan))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const plans = await Promise.all(
    eligiblePlans.map((plan) =>
      mapPlanForPaywall(plan, nowMs, ctx, currentPlanId ?? undefined),
    ),
  );

  return {
    canAccess: false,
    usesPackageModel,
    paywallMode: isActive ? "packages_upgrade" : "packages_subscribe",
    currentPlanId,
    plans,
  };
}

export async function getAuthenticatedUserOrThrow(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "You must be signed in to continue.",
    });
  }

  const user = await ctx.db.get(userId as Id<"users">);
  if (!user || user.deletedAt) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Your account is not set up. Please contact support.",
    });
  }

  return user;
}

export async function viewerCanAccessPersonalTests(
  ctx: QueryCtx | MutationCtx,
  nowMs: number,
): Promise<boolean> {
  const user = await getAuthenticatedUserOrThrow(ctx);
  const access = await resolvePersonalTestAccess(ctx, user, nowMs);
  return access.canAccess;
}

export async function requirePersonalTestAccess(
  ctx: QueryCtx | MutationCtx,
  nowMs = Date.now(),
): Promise<void> {
  const canAccess = await viewerCanAccessPersonalTests(ctx, nowMs);
  if (!canAccess) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Your subscription does not include personal tests.",
    });
  }
}
