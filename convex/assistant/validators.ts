import { v } from "convex/values";

export const assistantLanguageValidator = v.union(v.literal("en"), v.literal("ar"));

export const courseAccessStatusValidator = v.union(
  v.literal("included"),
  v.literal("locked"),
  v.literal("unknown"),
);

export const courseSearchResultValidator = v.object({
  id: v.string(),
  title: v.string(),
  description: v.string(),
  slug: v.string(),
  imageUrl: v.optional(v.string()),
  category: v.optional(v.string()),
  durationMinutes: v.optional(v.number()),
  accessStatus: courseAccessStatusValidator,
  language: assistantLanguageValidator,
  usedFallbackTranslation: v.boolean(),
});

export const subscriptionToolResultValidator = v.object({
  authenticated: v.boolean(),
  status: v.union(
    v.literal("active"),
    v.literal("trialing"),
    v.literal("past_due"),
    v.literal("canceled"),
    v.literal("paused"),
    v.literal("none"),
  ),
  planNameEn: v.optional(v.string()),
  planNameAr: v.optional(v.string()),
  currentPeriodEnd: v.optional(v.number()),
  cancelAtPeriodEnd: v.optional(v.boolean()),
  hasBillingAccount: v.boolean(),
});

export const billingPortalResultValidator = v.object({
  url: v.string(),
});

export const conversationTitleUpdateResultValidator = v.object({
  success: v.boolean(),
  title: v.optional(v.string()),
  reason: v.optional(v.string()),
});

export const userMemoryUpdateResultValidator = v.object({
  success: v.boolean(),
  reason: v.optional(v.string()),
});
