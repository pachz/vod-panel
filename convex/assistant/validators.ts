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
  titleEn: v.optional(v.string()),
  titleAr: v.optional(v.string()),
  description: v.string(),
  descriptionEn: v.optional(v.string()),
  descriptionAr: v.optional(v.string()),
  slug: v.string(),
  imageUrl: v.optional(v.string()),
  category: v.optional(v.string()),
  categoryEn: v.optional(v.string()),
  categoryAr: v.optional(v.string()),
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

export const activeSubscriptionPlanValidator = v.object({
  id: v.string(),
  nameEn: v.string(),
  nameAr: v.string(),
  billingInterval: v.union(v.literal("month"), v.literal("year")),
  priceAmount: v.number(),
  priceCurrency: v.string(),
  compareAtPriceAmount: v.optional(v.number()),
  priceSubtitleEn: v.optional(v.string()),
  priceSubtitleAr: v.optional(v.string()),
  courseCount: v.optional(v.number()),
  lessonCount: v.optional(v.number()),
  hours: v.optional(v.number()),
  featureTitlesEn: v.array(v.string()),
  featureTitlesAr: v.array(v.string()),
  isCurrentPlan: v.boolean(),
  isAtCapacity: v.boolean(),
});

export const billingPortalResultValidator = v.object({
  url: v.string(),
});

export const renderUiCardsResultValidator = v.object({
  courses: v.array(courseSearchResultValidator),
  plans: v.array(activeSubscriptionPlanValidator),
  subscription: v.union(subscriptionToolResultValidator, v.null()),
  billingPortalUrl: v.union(v.string(), v.null()),
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
