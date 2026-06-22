import { z } from "zod";

/** Shared limits for plan editor UI and Zod validation. */
export const PLAN_FIELD_LIMITS = {
  name: 64,
  nameAr: 64,
  slug: 64,
  priceSubtitle: 200,
  ribbonText: 64,
  inheritsDescription: 300,
  inheritsDescriptionAr: 300,
  featureTitle: 200,
  featureTitleAr: 200,
  featureSubtitle: 500,
  featureSubtitleAr: 500,
  featureSubtitleTemplate: 500,
  featureSubtitleTemplateAr: 500,
  maxFeatures: 30,
  displayOrder: 1000,
  featureDisplayOrder: 100,
  maxCapacity: 1_000_000,
} as const;

const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color (e.g. #FF5733).");

export const planThemeSchema = z.object({
  primary: hexColorSchema,
  secondary: hexColorSchema,
  border: hexColorSchema,
  headerBg: hexColorSchema,
  buttonBg: hexColorSchema,
});

export const planFeatureSubtitleModeSchema = z.enum(["manual", "template"]);

export const planFeatureSchema = z.object({
  icon: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(PLAN_FIELD_LIMITS.featureTitle),
  titleAr: z.string().trim().max(PLAN_FIELD_LIMITS.featureTitleAr).optional(),
  subtitle: z.string().trim().max(PLAN_FIELD_LIMITS.featureSubtitle).optional(),
  subtitleAr: z.string().trim().max(PLAN_FIELD_LIMITS.featureSubtitleAr).optional(),
  subtitleMode: planFeatureSubtitleModeSchema.optional().default("manual"),
  subtitleTemplate: z.string().trim().max(PLAN_FIELD_LIMITS.featureSubtitleTemplate).optional(),
  subtitleTemplateAr: z.string().trim().max(PLAN_FIELD_LIMITS.featureSubtitleTemplateAr).optional(),
  isChecklistItem: z.boolean(),
  displayOrder: z.number().int().min(0).max(PLAN_FIELD_LIMITS.featureDisplayOrder),
});

export const planBadgeTagSchema = z.enum([
  "start_here",
  "best_value",
  "most_popular",
  "limited",
  "vip",
  "none",
]);

export const planBillingIntervalSchema = z.enum(["month", "year"]);

export const planCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(PLAN_FIELD_LIMITS.name),
  nameAr: z.string().trim().min(1).max(PLAN_FIELD_LIMITS.nameAr),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(PLAN_FIELD_LIMITS.slug)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens."),
  billingInterval: planBillingIntervalSchema,
  priceAmount: z.number().int().min(50, "Price must be at least 50 cents."),
  priceCurrency: z.string().trim().min(3).max(3).toLowerCase(),
  compareAtPriceAmount: z.number().int().min(50).optional(),
  priceSubtitle: z.string().trim().max(PLAN_FIELD_LIMITS.priceSubtitle).optional(),
  theme: planThemeSchema,
  badgeTag: planBadgeTagSchema,
  ribbonText: z.string().trim().max(PLAN_FIELD_LIMITS.ribbonText).optional(),
  inheritsDescription: z.string().trim().max(PLAN_FIELD_LIMITS.inheritsDescription).optional(),
  inheritsDescriptionAr: z.string().trim().max(PLAN_FIELD_LIMITS.inheritsDescriptionAr).optional(),
  includeAllCourses: z.boolean(),
  includedCourseIds: z.array(z.string()),
  includedCategoryIds: z.array(z.string()),
  features: z.array(planFeatureSchema).max(PLAN_FIELD_LIMITS.maxFeatures),
  displayOrder: z.number().int().min(0).max(PLAN_FIELD_LIMITS.displayOrder),
  isActive: z.boolean(),
  maxCapacity: z.number().int().min(1).max(PLAN_FIELD_LIMITS.maxCapacity).optional(),
});

export const planUpdateInputSchema = planCreateInputSchema.omit({
  billingInterval: true,
  priceAmount: true,
  priceCurrency: true,
});

export const planPriceUpdateSchema = z.object({
  priceAmount: z.number().int().min(50, "Price must be at least 50 cents."),
});

export type PlanTheme = z.infer<typeof planThemeSchema>;
export type PlanFeature = z.infer<typeof planFeatureSchema>;
export type PlanCreateInput = z.infer<typeof planCreateInputSchema>;
export type PlanUpdateInput = z.infer<typeof planUpdateInputSchema>;

export const DEFAULT_PLAN_THEME: PlanTheme = {
  primary: "#E91E8C",
  secondary: "#9C27B0",
  border: "#E0E0E0",
  headerBg: "#FFFFFF",
  buttonBg: "#E91E8C",
};

export { DEFAULT_PLAN_THEME_INPUT, expandPlanTheme, collapsePlanTheme } from "../planTheme";
export type { PlanThemeInput } from "../planTheme";
