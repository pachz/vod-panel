import { internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  countActiveSubscribersForPlan,
  getStoredPlanCourseStats,
} from "./plansInternal";
import { resolvePlanFeaturesForDisplay } from "../shared/planFeatureTemplate";

type CategoryItem = {
  id: Id<"categories">;
  nameEn: string;
  nameAr: string;
  main: boolean;
};

type LandingCourse = {
  id: Id<"courses">;
  slug: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  shortDescriptionEn: string;
  shortDescriptionAr: string;
  categories: Array<CategoryItem>;
  durationMinutes: number;
  watchedHours: number;
  coverImageUrl: string;
  updatedAt: number;
  coachId: Id<"coaches"> | null;
};

type LandingCourseLesson = {
  id: Id<"lessons">;
  titleEn: string;
  titleAr: string;
  durationMinutes: number;
};

type LandingCourseDetail = Omit<LandingCourse, "shortDescriptionEn" | "shortDescriptionAr"> & {
  shortDescriptionEn: string;
  shortDescriptionAr: string;
  instructor: string;
  trialVideoUrl: string;
  thumbnailImageUrl: string;
  lessons: Array<LandingCourseLesson>;
};

type LandingCoachProfile = {
  id: Id<"coaches">;
  nameEn: string;
  nameAr: string;
  expertiseEn: string;
  expertiseAr: string;
  descriptionEn: string;
  descriptionAr: string;
  rating: number;
  profileImageUrl: string | null;
  profileThumbnailUrl: string | null;
  lastUpdatedAt: number;
};

export const listLandingCoaches = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("coaches"),
      nameEn: v.string(),
      nameAr: v.string(),
      expertiseEn: v.string(),
      expertiseAr: v.string(),
      descriptionEn: v.string(),
      descriptionAr: v.string(),
      rating: v.number(),
      profileImageUrl: v.union(v.null(), v.string()),
      profileThumbnailUrl: v.union(v.null(), v.string()),
      lastUpdatedAt: v.number(),
    }),
  ),
  handler: async (ctx): Promise<Array<LandingCoachProfile>> => {
    const coaches = await ctx.db
      .query("coaches")
      .withIndex("deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();

    return coaches.map((coach) => ({
      id: coach._id,
      nameEn: coach.name,
      nameAr: coach.name_ar,
      expertiseEn: coach.expertise,
      expertiseAr: coach.expertise_ar,
      descriptionEn: coach.description,
      descriptionAr: coach.description_ar,
      rating: coach.rating,
      profileImageUrl: coach.profile_image_url ?? null,
      profileThumbnailUrl: coach.profile_thumbnail_url ?? null,
      lastUpdatedAt: coach.updatedAt,
    }));
  },
});

export const listLandingCourses = internalQuery({
  args: {
    limit: v.number(),
  },
  returns: v.array(
    v.object({
      id: v.id("courses"),
      slug: v.string(),
      titleEn: v.string(),
      titleAr: v.string(),
      descriptionEn: v.string(),
      descriptionAr: v.string(),
      shortDescriptionEn: v.string(),
      shortDescriptionAr: v.string(),
      categories: v.array(
        v.object({
          id: v.id("categories"),
          nameEn: v.string(),
          nameAr: v.string(),
          main: v.boolean(),
        }),
      ),
      durationMinutes: v.number(),
      watchedHours: v.number(),
      coverImageUrl: v.string(),
      updatedAt: v.number(),
      coachId: v.union(v.id("coaches"), v.null()),
    }),
  ),
  handler: async (ctx, args): Promise<Array<LandingCourse>> => {
    const normalizedLimit = Math.min(Math.max(Math.floor(args.limit), 5), 200);

    const courses = await ctx.db
      .query("courses")
      .withIndex("deletedAt_status", (q) =>
        q.eq("deletedAt", undefined).eq("status", "published"),
      )
      .collect();

    // Sort by displayOrder (default 50 if null), then by createdAt and _id for consistency
    courses.sort((a, b) => {
      const orderA = a.displayOrder ?? 50;
      const orderB = b.displayOrder ?? 50;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      const createdA = a.createdAt ?? 0;
      const createdB = b.createdAt ?? 0;

      if (createdA !== createdB) {
        return createdA - createdB;
      }

      return a._id.localeCompare(b._id);
    });

    const sortedCourses = courses.slice(0, normalizedLimit);
    const courseIds = sortedCourses.map((c) => c._id);
    const watchedHoursList = await ctx.runQuery(
      internal.lessonProgress.getWatchedHoursByCoursesBatch,
      { courseIds },
    );
    const watchedHoursMap = new Map(
      courseIds.map((id, i) => [id, watchedHoursList[i] ?? 0]),
    );

    const categoryIds = Array.from(
      new Set<Id<"categories">>(courses.map((course) => course.category_id)),
    );

    const categories = await Promise.all(
      categoryIds.map(async (categoryId) => {
        const category = await ctx.db.get(categoryId);
        if (category && category.deletedAt === undefined) {
          return category;
        }
        return null;
      }),
    );

    const categoryMap = new Map<Id<"categories">, Doc<"categories">>();
    for (const category of categories) {
      if (category) {
        categoryMap.set(category._id, category);
      }
    }

    const allAdditionalIds = Array.from(
      new Set<Id<"categories">>(
        sortedCourses.flatMap((c) => c.additional_category_ids ?? []),
      ),
    );
    for (const categoryId of allAdditionalIds) {
      if (!categoryMap.has(categoryId)) {
        const category = await ctx.db.get(categoryId);
        if (category && category.deletedAt === undefined) {
          categoryMap.set(categoryId, category);
        }
      }
    }

    return sortedCourses.map((course) => {
      const category = categoryMap.get(course.category_id);
      const additionalCategoryIds = course.additional_category_ids ?? [];
      const additionalItems: Array<CategoryItem> = additionalCategoryIds
        .map((catId) => {
          const cat = categoryMap.get(catId);
          if (!cat) return null;
          return {
            id: cat._id,
            nameEn: cat.name,
            nameAr: cat.name_ar,
            main: false,
          };
        })
        .filter((c): c is CategoryItem => c !== null);

      const categories: Array<CategoryItem> = [];
      if (category) {
        categories.push({
          id: category._id,
          nameEn: category.name,
          nameAr: category.name_ar,
          main: true,
        });
      }
      categories.push(...additionalItems);

      return {
        id: course._id,
        slug: course.slug,
        titleEn: course.name,
        titleAr: course.name_ar,
        descriptionEn: course.description ?? course.short_description ?? "",
        descriptionAr: course.description_ar ?? course.short_description_ar ?? "",
        shortDescriptionEn: course.short_description ?? "",
        shortDescriptionAr: course.short_description_ar ?? "",
        categories,
        durationMinutes: Math.round((course.duration ?? 0) / 60),
        watchedHours: watchedHoursMap.get(course._id) ?? 0,
        coverImageUrl:
          course.banner_image_url ??
          course.thumbnail_image_url ??
          "",
        updatedAt: course.updatedAt ?? course.createdAt,
        coachId: course.coach_id ?? null,
      };
    });
  },
});

export const getLandingCourseBySlug = internalQuery({
  args: {
    slug: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("courses"),
      slug: v.string(),
      titleEn: v.string(),
      titleAr: v.string(),
      descriptionEn: v.string(),
      descriptionAr: v.string(),
      shortDescriptionEn: v.string(),
      shortDescriptionAr: v.string(),
      categories: v.array(
        v.object({
          id: v.id("categories"),
          nameEn: v.string(),
          nameAr: v.string(),
          main: v.boolean(),
        }),
      ),
      durationMinutes: v.number(),
      watchedHours: v.number(),
      coverImageUrl: v.string(),
      thumbnailImageUrl: v.string(),
      instructor: v.string(),
      trialVideoUrl: v.string(),
      coachId: v.union(v.id("coaches"), v.null()),
      lessons: v.array(
        v.object({
          id: v.id("lessons"),
          titleEn: v.string(),
          titleAr: v.string(),
          durationMinutes: v.number(),
        }),
      ),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args): Promise<(LandingCourseDetail & { coachId: Id<"coaches"> | null }) | null> => {
    const courses = await ctx.db
      .query("courses")
      .withIndex("slug", (q) => q.eq("slug", args.slug))
      .collect();

    const course = courses.find(
      (candidate) =>
        candidate.deletedAt === undefined && candidate.status === "published",
    );

    if (!course) {
      return null;
    }

    const category = await ctx.db.get(course.category_id);
    const additionalCategoryIds = course.additional_category_ids ?? [];
    const additionalItems: Array<CategoryItem> = await Promise.all(
      additionalCategoryIds.map(async (catId) => {
        const cat = await ctx.db.get(catId);
        if (!cat || cat.deletedAt !== undefined) {
          return null;
        }
        return {
          id: cat._id,
          nameEn: cat.name,
          nameAr: cat.name_ar,
          main: false,
        };
      }),
    ).then((arr) => arr.filter((c): c is CategoryItem => c !== null));

    const categories: Array<CategoryItem> = [];
    if (category) {
      categories.push({
        id: category._id,
        nameEn: category.name,
        nameAr: category.name_ar,
        main: true,
      });
    }
    categories.push(...additionalItems);

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("deletedAt_course_status", (q) =>
        q
          .eq("deletedAt", undefined)
          .eq("course_id", course._id)
          .eq("status", "published"),
      )
      .collect();

    lessons.sort((a, b) => a.priority - b.priority);

    const [watchedHours] = await ctx.runQuery(
      internal.lessonProgress.getWatchedHoursByCoursesBatch,
      { courseIds: [course._id] },
    );

    return {
      id: course._id,
      slug: course.slug,
      titleEn: course.name,
      titleAr: course.name_ar,
      descriptionEn: course.description ?? "",
      descriptionAr: course.description_ar ?? "",
      shortDescriptionEn: course.short_description ?? "",
      shortDescriptionAr: course.short_description_ar ?? "",
      categories,
      durationMinutes: Math.round((course.duration ?? 0) / 60),
      watchedHours: watchedHours ?? 0,
      coverImageUrl:
        course.banner_image_url ?? course.thumbnail_image_url ?? "",
      thumbnailImageUrl: course.thumbnail_image_url ?? "",
      instructor: course.instructor ?? "",
      trialVideoUrl: course.trial_video_url ?? "",
      coachId: course.coach_id ?? null,
      updatedAt: course.updatedAt ?? course.createdAt,
      lessons: lessons.map((lesson) => ({
        id: lesson._id,
        titleEn: lesson.title,
        titleAr: lesson.title_ar,
        durationMinutes: Math.round((lesson.duration ?? 0) / 60),
      })),
    };
  },
});

export const getCoachById = internalQuery({
  args: {
    coachId: v.id("coaches"),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("coaches"),
      _creationTime: v.number(),
      nameEn: v.string(),
      nameAr: v.string(),
      expertiseEn: v.string(),
      expertiseAr: v.string(),
      descriptionEn: v.string(),
      descriptionAr: v.string(),
      rating: v.number(),
      profileImageUrl: v.union(v.null(), v.string()),
      profileThumbnailUrl: v.union(v.null(), v.string()),
      courseCount: v.union(v.number(), v.null()),
      lastUpdatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args): Promise<{
    _id: Id<"coaches">;
    _creationTime: number;
    nameEn: string;
    nameAr: string;
    expertiseEn: string;
    expertiseAr: string;
    descriptionEn: string;
    descriptionAr: string;
    rating: number;
    profileImageUrl: string | null;
    profileThumbnailUrl: string | null;
    courseCount: number | null;
    lastUpdatedAt: number;
  } | null> => {
    const coach = await ctx.db.get(args.coachId);
    if (!coach || coach.deletedAt !== undefined) {
      return null;
    }
    return {
      _id: coach._id,
      _creationTime: coach._creationTime,
      nameEn: coach.name,
      nameAr: coach.name_ar,
      expertiseEn: coach.expertise,
      expertiseAr: coach.expertise_ar,
      descriptionEn: coach.description,
      descriptionAr: coach.description_ar,
      rating: coach.rating,
      profileImageUrl: coach.profile_image_url ?? null,
      profileThumbnailUrl: coach.profile_thumbnail_url ?? null,
      courseCount: coach.course_count ?? null,
      lastUpdatedAt: coach.updatedAt,
    };
  },
});

const landingPlanThemeValidator = v.object({
  primary: v.string(),
  secondary: v.string(),
  border: v.string(),
  headerBg: v.string(),
  buttonBg: v.string(),
});

const landingPackageFeatureValidator = v.object({
  icon: v.string(),
  titleEn: v.string(),
  titleAr: v.string(),
  subtitleEn: v.union(v.string(), v.null()),
  subtitleAr: v.union(v.string(), v.null()),
  isChecklistItem: v.boolean(),
  displayOrder: v.number(),
});

const landingPackageValidator = v.object({
  id: v.id("subscriptionPlans"),
  slug: v.string(),
  nameEn: v.string(),
  nameAr: v.string(),
  titleIcon: v.union(v.string(), v.null()),
  billingInterval: v.union(v.literal("month"), v.literal("year")),
  stripeProductId: v.string(),
  stripePriceId: v.string(),
  priceAmountCents: v.number(),
  priceAmount: v.number(),
  priceCurrency: v.string(),
  compareAtPriceAmountCents: v.union(v.number(), v.null()),
  priceSubtitleEn: v.union(v.string(), v.null()),
  priceSubtitleAr: v.union(v.string(), v.null()),
  intervalLabel: v.string(),
  priceDisplay: v.string(),
  theme: landingPlanThemeValidator,
  badgeTag: v.union(
    v.literal("start_here"),
    v.literal("best_value"),
    v.literal("most_popular"),
    v.literal("limited"),
    v.literal("vip"),
    v.literal("none"),
  ),
  ribbonTextEn: v.union(v.string(), v.null()),
  ribbonTextAr: v.union(v.string(), v.null()),
  inheritsDescriptionEn: v.union(v.string(), v.null()),
  inheritsDescriptionAr: v.union(v.string(), v.null()),
  includesPlanSlug: v.union(v.string(), v.null()),
  includesPlanNameEn: v.union(v.string(), v.null()),
  includesPlanNameAr: v.union(v.string(), v.null()),
  courseStats: v.object({
    courses: v.number(),
    lessons: v.number(),
    hours: v.number(),
  }),
  features: v.array(landingPackageFeatureValidator),
  displayOrder: v.number(),
  isAtCapacity: v.boolean(),
});

const landingCoursePackagePillValidator = v.object({
  id: v.id("subscriptionPlans"),
  slug: v.string(),
  nameEn: v.string(),
  nameAr: v.string(),
  color: v.string(),
  theme: landingPlanThemeValidator,
  billingInterval: v.union(v.literal("month"), v.literal("year")),
  priceAmountCents: v.number(),
  priceAmount: v.number(),
  priceCurrency: v.string(),
  compareAtPriceAmountCents: v.union(v.number(), v.null()),
  intervalLabel: v.string(),
  priceDisplay: v.string(),
  priceSubtitleEn: v.union(v.string(), v.null()),
  priceSubtitleAr: v.union(v.string(), v.null()),
  stripePriceId: v.string(),
});

type LandingPlanTheme = {
  primary: string;
  secondary: string;
  border: string;
  headerBg: string;
  buttonBg: string;
};

type LandingPackage = {
  id: Id<"subscriptionPlans">;
  slug: string;
  nameEn: string;
  nameAr: string;
  titleIcon: string | null;
  billingInterval: "month" | "year";
  stripeProductId: string;
  stripePriceId: string;
  priceAmountCents: number;
  priceAmount: number;
  priceCurrency: string;
  compareAtPriceAmountCents: number | null;
  priceSubtitleEn: string | null;
  priceSubtitleAr: string | null;
  intervalLabel: string;
  priceDisplay: string;
  theme: LandingPlanTheme;
  badgeTag: Doc<"subscriptionPlans">["badgeTag"];
  ribbonTextEn: string | null;
  ribbonTextAr: string | null;
  inheritsDescriptionEn: string | null;
  inheritsDescriptionAr: string | null;
  includesPlanSlug: string | null;
  includesPlanNameEn: string | null;
  includesPlanNameAr: string | null;
  courseStats: { courses: number; lessons: number; hours: number };
  features: Array<{
    icon: string;
    titleEn: string;
    titleAr: string;
    subtitleEn: string | null;
    subtitleAr: string | null;
    isChecklistItem: boolean;
    displayOrder: number;
  }>;
  displayOrder: number;
  isAtCapacity: boolean;
};

const INTERVAL_LABELS: Record<Doc<"subscriptionPlans">["billingInterval"], string> = {
  month: "Monthly",
  year: "Yearly",
};

function resolveLandingPlanPricing(plan: Doc<"subscriptionPlans">) {
  const amount = plan.priceAmount / 100;
  const intervalLabel = INTERVAL_LABELS[plan.billingInterval];
  const currency = plan.priceCurrency.toUpperCase();

  return {
    billingInterval: plan.billingInterval,
    priceAmountCents: plan.priceAmount,
    priceAmount: amount,
    priceCurrency: currency,
    compareAtPriceAmountCents: plan.compareAtPriceAmount ?? null,
    intervalLabel,
    priceDisplay: `${currency} ${amount.toFixed(2)} / ${intervalLabel.toLowerCase()}`,
    priceSubtitleEn: plan.priceSubtitle ?? null,
    priceSubtitleAr: plan.priceSubtitle_ar ?? null,
    stripePriceId: plan.stripePriceId,
  };
}

function isPublicPlan(plan: Doc<"subscriptionPlans">): boolean {
  return (
    plan.deletedAt === undefined &&
    plan.isActive &&
    plan.isHidden !== true
  );
}

function resolveLandingFeatures(plan: Doc<"subscriptionPlans">) {
  const stats = getStoredPlanCourseStats(plan);
  const resolved = resolvePlanFeaturesForDisplay(
    plan.features.map((feature) => ({
      icon: feature.icon,
      title: feature.title,
      title_ar: feature.title_ar,
      subtitle: feature.subtitle,
      subtitleAr: feature.subtitle_ar,
      subtitleMode: feature.subtitleMode,
      subtitleTemplate: feature.subtitleTemplate,
      subtitleTemplateAr: feature.subtitleTemplate_ar,
      isChecklistItem: feature.isChecklistItem,
      displayOrder: feature.displayOrder,
    })),
    stats,
  );

  return resolved.map((feature) => ({
    icon: feature.icon,
    titleEn: feature.title,
    titleAr: feature.title_ar ?? feature.title,
    subtitleEn: feature.subtitle ?? null,
    subtitleAr: feature.subtitle_ar ?? null,
    isChecklistItem: feature.isChecklistItem,
    displayOrder: feature.displayOrder,
  }));
}

async function mapPlanToLandingPackage(
  ctx: QueryCtx,
  plan: Doc<"subscriptionPlans">,
  nowMs: number,
  includedPlan?: Doc<"subscriptionPlans"> | null,
): Promise<LandingPackage> {
  const pricing = resolveLandingPlanPricing(plan);
  const activeSubscriberCount = await countActiveSubscribersForPlan(ctx, plan, nowMs);
  const maxCapacity = plan.maxCapacity ?? null;
  const isAtCapacity = maxCapacity !== null && activeSubscriberCount >= maxCapacity;

  return {
    id: plan._id,
    slug: plan.slug,
    nameEn: plan.name,
    nameAr: plan.name_ar,
    titleIcon: plan.titleIcon ?? null,
    ...pricing,
    stripeProductId: plan.stripeProductId,
    theme: plan.theme,
    badgeTag: plan.badgeTag,
    ribbonTextEn: plan.ribbonText ?? null,
    ribbonTextAr: plan.ribbonText_ar ?? null,
    inheritsDescriptionEn: plan.inheritsDescription ?? null,
    inheritsDescriptionAr: plan.inheritsDescription_ar ?? null,
    includesPlanSlug: includedPlan?.slug ?? null,
    includesPlanNameEn: includedPlan?.name ?? null,
    includesPlanNameAr: includedPlan?.name_ar ?? null,
    courseStats: getStoredPlanCourseStats(plan),
    features: resolveLandingFeatures(plan),
    displayOrder: plan.displayOrder,
    isAtCapacity,
  };
}

export const listLandingPackages = internalQuery({
  args: {},
  returns: v.array(landingPackageValidator),
  handler: async (ctx): Promise<Array<LandingPackage>> => {
    const nowMs = Date.now();
    const plans = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();

    const publicPlans = plans
      .filter(isPublicPlan)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    const includedPlanIds = publicPlans
      .map((plan) => plan.includesPlanId)
      .filter((planId): planId is Id<"subscriptionPlans"> => planId !== undefined);
    const includedPlans = await Promise.all(
      includedPlanIds.map(async (planId) => {
        const plan = await ctx.db.get(planId);
        return plan && plan.deletedAt === undefined ? plan : null;
      }),
    );
    const includedPlanById = new Map<Id<"subscriptionPlans">, Doc<"subscriptionPlans">>();
    for (const plan of includedPlans) {
      if (plan) {
        includedPlanById.set(plan._id, plan);
      }
    }

    const packages: Array<LandingPackage> = [];
    for (const plan of publicPlans) {
      const includedPlan = plan.includesPlanId
        ? includedPlanById.get(plan.includesPlanId) ?? null
        : null;
      packages.push(await mapPlanToLandingPackage(ctx, plan, nowMs, includedPlan));
    }

    return packages;
  },
});

export const getLandingPlansForCourse = internalQuery({
  args: {
    courseId: v.id("courses"),
  },
  returns: v.array(landingCoursePackagePillValidator),
  handler: async (ctx, args) => {
    const plans = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();

    return plans
      .filter(
        (plan) =>
          isPublicPlan(plan) && plan.resolvedCourseIds.includes(args.courseId),
      )
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((plan) => ({
        id: plan._id,
        slug: plan.slug,
        nameEn: plan.name,
        nameAr: plan.name_ar,
        color: plan.theme.primary,
        theme: plan.theme,
        ...resolveLandingPlanPricing(plan),
      }));
  },
});

export const getFeaturedCoach = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("coaches"),
      nameEn: v.string(),
      nameAr: v.string(),
      expertiseEn: v.string(),
      expertiseAr: v.string(),
      descriptionEn: v.string(),
      descriptionAr: v.string(),
      rating: v.number(),
      profileImageUrl: v.union(v.null(), v.string()),
      profileThumbnailUrl: v.union(v.null(), v.string()),
      lastUpdatedAt: v.number(),
    }),
  ),
  handler: async (ctx): Promise<LandingCoachProfile | null> => {
    const [coach] = await ctx.db.query("coaches").take(1);
    if (!coach) {
      return null;
    }

    return {
      id: coach._id,
      nameEn: coach.name,
      nameAr: coach.name_ar,
      expertiseEn: coach.expertise,
      expertiseAr: coach.expertise_ar,
      descriptionEn: coach.description,
      descriptionAr: coach.description_ar,
      rating: coach.rating,
      profileImageUrl: coach.profile_image_url ?? null,
      profileThumbnailUrl: coach.profile_thumbnail_url ?? null,
      lastUpdatedAt: coach.updatedAt,
    };
  },
});

