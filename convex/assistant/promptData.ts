import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { mapSubscriptionStatus } from "./lib";
import { pickPrimarySubscriptionForUserDisplay } from "../paymentInternal";
import {
  ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS,
  ASSISTANT_FIXED_INSTRUCTIONS,
  buildAssistantSystemPrompt,
} from "./prompt";

const SETTINGS_KEY = "global" as const;

function formatLoginMethods(hasPassword: boolean, hasGoogle: boolean): string {
  const methods: Array<string> = [];
  if (hasPassword) {
    methods.push("email/password");
  }
  if (hasGoogle) {
    methods.push("Google");
  }
  if (methods.length === 0) {
    return "unknown";
  }
  return methods.join(", ");
}

export async function loadCustomInstructions(ctx: QueryCtx): Promise<string> {
  const settings = await ctx.db
    .query("assistantSettings")
    .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
    .unique();

  return settings?.customInstructions ?? ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS;
}

export async function loadUserContext(
  ctx: QueryCtx,
  userId: Id<"users">,
  nowMs: number,
): Promise<string> {
  const user = await ctx.db.get(userId);
  if (!user || user.deletedAt !== undefined) {
    return "User record not found.";
  }

  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .collect();

  const hasPassword = accounts.some((account) => account.provider === "password");
  const hasGoogle = accounts.some((account) => account.provider === "google");

  const subs = await ctx.db
    .query("subscriptions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  const subscription = pickPrimarySubscriptionForUserDisplay(subs, nowMs);
  const subscriptionStatus = mapSubscriptionStatus(subscription, nowMs);

  let planName: string | undefined;
  if (subscription?.planId) {
    const plan = await ctx.db.get(subscription.planId);
    if (plan && plan.deletedAt === undefined) {
      planName = plan.name;
    }
  }

  const lines = [
    `- Name: ${user.name?.trim() || "Not provided"}`,
    `- Email: ${user.email?.trim() || "Not provided"}`,
    `- Login method(s): ${formatLoginMethods(hasPassword, hasGoogle)}`,
    `- Email verified: ${user.emailVerificationTime ? "yes" : "no"}`,
    `- Account role: ${user.isGod ? "admin" : user.isTech ? "tech" : "member"}`,
    `- Subscription status: ${subscriptionStatus}`,
  ];

  if (planName) {
    lines.push(`- Current plan: ${planName}`);
  }

  if (user.phone?.trim()) {
    lines.push(`- Phone: ${user.phone.trim()}`);
  }

  if (user.subscriptionModel) {
    lines.push(`- Billing model: ${user.subscriptionModel}`);
  }

  return lines.join("\n");
}

export async function loadUserMemory(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<string | null> {
  const record = await ctx.db
    .query("assistantUserMemory")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

  const memory = record?.memory?.trim();
  return memory && memory.length > 0 ? memory : null;
}

export async function buildRuntimeSystemInstructions(
  ctx: QueryCtx,
  userId: Id<"users">,
  nowMs: number,
): Promise<string> {
  const customInstructions = await loadCustomInstructions(ctx);
  const userContext = await loadUserContext(ctx, userId, nowMs);
  const userMemory = await loadUserMemory(ctx, userId);

  return buildAssistantSystemPrompt({
    customInstructions,
    userContext,
    userMemory,
  });
}

export { ASSISTANT_FIXED_INSTRUCTIONS, ASSISTANT_DEFAULT_CUSTOM_INSTRUCTIONS };
