import { z } from "zod";

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
  title: z.string().trim().min(1).max(200),
  titleAr: z.string().trim().max(200).optional(),
  subtitle: z.string().trim().max(500).optional(),
  subtitleAr: z.string().trim().max(500).optional(),
  subtitleMode: planFeatureSubtitleModeSchema.optional().default("manual"),
  subtitleTemplate: z.string().trim().max(500).optional(),
  subtitleTemplateAr: z.string().trim().max(500).optional(),
  isChecklistItem: z.boolean(),
  displayOrder: z.number().int().min(0).max(100),
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
  name: z.string().trim().min(1).max(64),
  nameAr: z.string().trim().min(1).max(64),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens."),
  billingInterval: planBillingIntervalSchema,
  priceAmount: z.number().int().min(50, "Price must be at least 50 cents."),
  priceCurrency: z.string().trim().min(3).max(3).toLowerCase(),
  compareAtPriceAmount: z.number().int().min(50).optional(),
  priceSubtitle: z.string().trim().max(200).optional(),
  theme: planThemeSchema,
  badgeTag: planBadgeTagSchema,
  ribbonText: z.string().trim().max(64).optional(),
  includesPlanId: z.string().optional(),
  includeAllCourses: z.boolean(),
  includedCourseIds: z.array(z.string()),
  includedCategoryIds: z.array(z.string()),
  features: z.array(planFeatureSchema).max(30),
  displayOrder: z.number().int().min(0).max(1000),
  isActive: z.boolean(),
  maxCapacity: z.number().int().min(1).max(1_000_000).optional(),
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
