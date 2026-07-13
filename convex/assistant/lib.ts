import { getThreadMetadata } from "@convex-dev/agent";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { components } from "../_generated/api";
import { pickPrimarySubscriptionForUserDisplay } from "../paymentInternal";
import { usesPackageSubscriptionModel } from "../../shared/subscriptionModel";

type AccessStatus = "included" | "locked" | "unknown";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export async function authorizeThreadAccess(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  threadId: string,
): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required");
  }

  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required");
  }

  const { userId: threadUserId } = await getThreadMetadata(ctx, components.agent, {
    threadId,
  });

  if (threadUserId && threadUserId !== userId) {
    throw new Error("Unauthorized: thread does not belong to user");
  }

  return userId as Id<"users">;
}

export function pickLocalizedCourseText(
  language: "en" | "ar",
  english?: string,
  arabic?: string,
): { text: string; usedFallbackTranslation: boolean } {
  if (language === "ar") {
    if (arabic && arabic.trim().length > 0) {
      return { text: arabic, usedFallbackTranslation: false };
    }
    if (english && english.trim().length > 0) {
      return { text: english, usedFallbackTranslation: true };
    }
    return { text: "", usedFallbackTranslation: false };
  }

  if (english && english.trim().length > 0) {
    return { text: english, usedFallbackTranslation: false };
  }
  if (arabic && arabic.trim().length > 0) {
    return { text: arabic, usedFallbackTranslation: true };
  }
  return { text: "", usedFallbackTranslation: false };
}

export function secondsToMinutes(seconds: number | undefined): number | undefined {
  if (seconds === undefined || seconds <= 0) {
    return undefined;
  }
  return Math.round(seconds / 60);
}

async function userHasLegacyAccess(
  ctx: QueryCtx,
  userId: Id<"users">,
  nowMs: number,
): Promise<boolean> {
  const subs = await ctx.db
    .query("subscriptions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  const subscription = pickPrimarySubscriptionForUserDisplay(subs, nowMs);
  return Boolean(
    subscription &&
      ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) &&
      subscription.currentPeriodEnd >= nowMs,
  );
}

async function userHasCourseViaPlan(
  ctx: QueryCtx,
  userId: Id<"users">,
  courseId: Id<"courses">,
  nowMs: number,
): Promise<boolean> {
  const subs = await ctx.db
    .query("subscriptions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  const subscription = pickPrimarySubscriptionForUserDisplay(subs, nowMs);

  if (
    !subscription ||
    !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) ||
    subscription.currentPeriodEnd < nowMs ||
    !subscription.planId
  ) {
    return false;
  }

  const plan = await ctx.db.get(subscription.planId);
  if (!plan || plan.deletedAt !== undefined) {
    return false;
  }

  return plan.resolvedCourseIds.includes(courseId);
}

export async function getCourseAccessStatus(
  ctx: QueryCtx,
  userId: Id<"users"> | null,
  courseId: Id<"courses">,
  nowMs: number,
): Promise<AccessStatus> {
  if (!userId) {
    return "unknown";
  }

  const user = await ctx.db.get(userId);
  if (!user || user.deletedAt !== undefined) {
    return "unknown";
  }

  if (user.isGod) {
    return "included";
  }

  if (!usesPackageSubscriptionModel(user)) {
    return (await userHasLegacyAccess(ctx, userId, nowMs)) ? "included" : "locked";
  }

  return (await userHasCourseViaPlan(ctx, userId, courseId, nowMs))
    ? "included"
    : "locked";
}

export function mapSubscriptionStatus(
  subscription: Doc<"subscriptions"> | null,
  nowMs: number,
):
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "paused"
  | "none" {
  if (!subscription) {
    return "none";
  }

  if (subscription.status === "trialing") {
    return "trialing";
  }

  if (subscription.status === "past_due" || subscription.status === "unpaid") {
    return "past_due";
  }

  if (subscription.status === "canceled") {
    return "canceled";
  }

  if (
    subscription.status === "active" &&
    subscription.currentPeriodEnd >= nowMs
  ) {
    return "active";
  }

  if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd >= nowMs) {
    return "active";
  }

  return "canceled";
}
