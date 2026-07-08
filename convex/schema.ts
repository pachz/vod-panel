import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    /** Combined name + email for full-text search (one index). */
    name_search: v.optional(v.string()),
    phone: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    isGod: v.optional(v.boolean()),
    isTech: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    stripeCustomerId: v.optional(v.string()), // Stripe customer ID
    /** When "packages", user sees plan-based billing; unset/legacy = all-access subscription. */
    subscriptionModel: v.optional(
      v.union(v.literal("legacy"), v.literal("packages")),
    ),
  })
    .index("email", ["email", "deletedAt"])
    .index("by_deletedAt_subscriptionModel", ["deletedAt", "subscriptionModel"])
    .index("stripeCustomerId", ["stripeCustomerId"])
    .index("by_deletedAt", ["deletedAt"])
    .index("by_deletedAt_isGod", ["deletedAt", "isGod"])
    .searchIndex("search_name", {
      searchField: "name_search",
      filterFields: ["deletedAt"],
    }),

  videos: defineTable({
    url: v.string(),
    createdAt: v.number(),
  }),

  categories: defineTable({
    name: v.string(),
    name_ar: v.string(),
    description: v.string(),
    description_ar: v.string(),
    slug: v.string(),
    course_count: v.number(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("name", ["name", "deletedAt"])
    .index("slug", ["slug"]),

  chapters: defineTable({
    course_id: v.id("courses"),
    title: v.string(),
    title_ar: v.string(),
    displayOrder: v.number(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("course_id", ["course_id", "deletedAt"])
    .index("course_id_displayOrder", ["course_id", "deletedAt", "displayOrder"]),

  courses: defineTable({
    name: v.string(),
    name_ar: v.string(),
    /** Combined name_en + name_ar for full-text search (one index). */
    name_search: v.optional(v.string()),
    description: v.optional(v.string()),
    description_ar: v.optional(v.string()),
    short_description: v.optional(v.string()),
    short_description_ar: v.optional(v.string()),
    slug: v.string(),
    category_id: v.id("categories"),
    additional_category_ids: v.optional(v.array(v.id("categories"))),
    coach_id: v.optional(v.id("coaches")),
    trial_video_url: v.optional(v.string()),
    duration: v.optional(v.number()),
    status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
    banner_image_url: v.optional(v.string()),
    thumbnail_image_url: v.optional(v.string()),
    instructor: v.optional(v.string()),
    lesson_count: v.number(),
    displayOrder: v.optional(v.number()),
    default_chapter_id: v.optional(v.id("chapters")),
    pdf_material_storage_id: v.optional(v.id("_storage")),
    pdf_material_name: v.optional(v.string()),
    pdf_material_size: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("name", ["name", "deletedAt"])
    .index("slug", ["slug"])
    .index("deletedAt_category_status", ["deletedAt", "category_id", "status"])
    .index("deletedAt_status", ["deletedAt", "status"])
    .index("deletedAt", ["deletedAt"])
    .index("coach_id", ["coach_id", "deletedAt"])
    .searchIndex("search_name", {
      searchField: "name_search",
      filterFields: ["deletedAt", "category_id", "status", "coach_id"],
    }),

  lessons: defineTable({
    title: v.string(),
    title_ar: v.string(),
    /** Combined title + title_ar for full-text search (one index). */
    title_search: v.optional(v.string()),
    short_review: v.string(),
    short_review_ar: v.string(),
    description: v.optional(v.string()),
    description_ar: v.optional(v.string()),
    learning_objectives: v.optional(v.string()),
    learning_objectives_ar: v.optional(v.string()),
    course_id: v.id("courses"),
    chapter_id: v.optional(v.id("chapters")),
    duration: v.optional(v.number()),
    type: v.union(v.literal("video"), v.literal("article")),
    status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
    // When a video lesson is requested to be published but is temporarily
    // saved as draft while waiting for Vimeo duration, we store the intended
    // status here so we can apply it once duration is available.
    pending_status: v.optional(
      v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
    ),
    video_url: v.optional(v.string()),
    body: v.optional(v.string()),
    body_ar: v.optional(v.string()),
    cover_image_url: v.optional(v.string()),
    thumbnail_image_url: v.optional(v.string()),
    priority: v.number(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("course_id", ["course_id", "deletedAt"])
    .index("chapter_id", ["chapter_id", "deletedAt"])
    .index("deletedAt_course_status", ["deletedAt", "course_id", "status"])
    .index("deletedAt_status", ["deletedAt", "status"])
    .index("deletedAt", ["deletedAt"])
    .searchIndex("search_title", {
      searchField: "title_search",
      filterFields: ["deletedAt", "course_id", "status"],
    }),

  lessonProgress: defineTable({
    user_id: v.id("users"),
    course_id: v.id("courses"),
    lesson_id: v.id("lessons"),
    completedAt: v.number(),
    /** Seconds watched (lesson duration at completion). Used for per-lesson/course aggregates. */
    watchedSeconds: v.optional(v.number()),
  }).index("by_user_course_lesson", ["user_id", "course_id", "lesson_id"]),

  coaches: defineTable({
    name: v.string(),
    name_ar: v.string(),
    expertise: v.string(),
    expertise_ar: v.string(),
    description: v.string(),
    description_ar: v.string(),
    rating: v.number(),
    profile_image_url: v.optional(v.string()),
    profile_thumbnail_url: v.optional(v.string()),
    course_count: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("deletedAt", ["deletedAt"])
    .index("name_deletedAt", ["name", "deletedAt"]),

  activityLogs: defineTable({
    entityType: v.union(
      v.literal("category"),
      v.literal("course"),
      v.literal("lesson"),
      v.literal("user"),
      v.literal("video"),
    ),
    action: v.union(
      v.literal("created"),
      v.literal("updated"),
      v.literal("deleted"),
    ),
    entityId: v.string(),
    entityName: v.string(),
    userId: v.optional(v.id("users")),
    userName: v.optional(v.string()),
    timestamp: v.number(),
  }).index("timestamp", ["timestamp"]),

  checkoutSessions: defineTable({
    sessionId: v.string(), // Stripe checkout session ID
    userId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("complete"),
      v.literal("expired"),
    ),
    customerId: v.optional(v.string()), // Stripe customer ID
    subscriptionId: v.optional(v.string()), // Stripe subscription ID
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("sessionId", ["sessionId"])
    .index("userId", ["userId"])
    .index("status", ["status"]),

  stripeWebhookEvents: defineTable({
    eventId: v.string(), // Stripe event id (evt_...)
    eventType: v.string(),
    source: v.union(v.literal("snapshot"), v.literal("thin")),
    attemptCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    processedAt: v.optional(v.number()),
  }).index("eventId", ["eventId"]),

  subscriptions: defineTable({
    subscriptionId: v.string(), // Stripe subscription ID
    userId: v.id("users"),
    customerId: v.string(), // Stripe customer ID
    status: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due"),
      v.literal("unpaid"),
      v.literal("incomplete"),
      v.literal("trialing"),
    ),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
    canceledAt: v.optional(v.number()),
    /** Billing interval from Stripe price (e.g. "month", "year") */
    interval: v.optional(v.string()),
    /** Interval count from Stripe price (e.g. 1 for monthly, 1 for yearly) */
    intervalCount: v.optional(v.number()),
    /** Subscription plan (when checkout uses plan-based pricing). */
    planId: v.optional(v.id("subscriptionPlans")),
    /** Stripe price ID at time of subscription (for capacity counting across price changes). */
    stripePriceId: v.optional(v.string()),
    /** Set when a legacy subscription is migrated to the package model (Stripe cancel-at-period-end). */
    legacyMigrationStatus: v.optional(v.literal("migrated")),
    legacyMigratedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("subscriptionId", ["subscriptionId"])
    .index("userId", ["userId"])
    .index("status", ["status"])
    .index("by_planId", ["planId"])
    .index("by_stripePriceId", ["stripePriceId"]),

  paymentSettings: defineTable({
    selectedProductId: v.string(), // Stripe product ID
    selectedPriceId: v.string(), // Monthly price ID (legacy field name)
    productName: v.string(),
    priceAmount: v.number(), // Monthly amount in cents (legacy field name)
    priceCurrency: v.string(), // Monthly currency (legacy field name)
    priceInterval: v.union(v.literal("month"), v.literal("year"), v.literal("week"), v.literal("day")), // Monthly interval (legacy)
    // Yearly price (optional)
    selectedYearlyPriceId: v.optional(v.string()),
    yearlyPriceAmount: v.optional(v.number()),
    yearlyPriceCurrency: v.optional(v.string()),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("selectedProductId", ["selectedProductId"]),

  subscriptionPlans: defineTable({
    name: v.string(),
    name_ar: v.string(),
    slug: v.string(),
    titleIcon: v.optional(v.string()),
    billingInterval: v.union(v.literal("month"), v.literal("year")),
    stripeProductId: v.string(),
    stripePriceId: v.string(),
    priceAmount: v.number(),
    priceCurrency: v.string(),
    compareAtPriceAmount: v.optional(v.number()),
    priceSubtitle: v.optional(v.string()),
    priceSubtitle_ar: v.optional(v.string()),
    theme: v.object({
      primary: v.string(),
      secondary: v.string(),
      border: v.string(),
      headerBg: v.string(),
      buttonBg: v.string(),
    }),
    badgeTag: v.union(
      v.literal("start_here"),
      v.literal("best_value"),
      v.literal("most_popular"),
      v.literal("limited"),
      v.literal("vip"),
      v.literal("none"),
    ),
    ribbonText: v.optional(v.string()),
    ribbonText_ar: v.optional(v.string()),
    inheritsDescription: v.optional(v.string()),
    inheritsDescription_ar: v.optional(v.string()),
    includesPlanId: v.optional(v.id("subscriptionPlans")),
    includeAllCourses: v.boolean(),
    includedCourseIds: v.array(v.id("courses")),
    includedCategoryIds: v.array(v.id("categories")),
    /** Published courses removed from the resolved set after inclusion rules apply. */
    excludedCourseIds: v.optional(v.array(v.id("courses"))),
    resolvedCourseIds: v.array(v.id("courses")),
    courseStats: v.optional(
      v.object({
        courses: v.number(),
        lessons: v.number(),
        hours: v.number(),
      }),
    ),
    features: v.array(
      v.object({
        icon: v.string(),
        title: v.string(),
        title_ar: v.optional(v.string()),
        subtitle: v.optional(v.string()),
        subtitle_ar: v.optional(v.string()),
        subtitleMode: v.optional(v.union(v.literal("manual"), v.literal("template"))),
        subtitleTemplate: v.optional(v.string()),
        subtitleTemplate_ar: v.optional(v.string()),
        isChecklistItem: v.boolean(),
        displayOrder: v.number(),
      }),
    ),
    displayOrder: v.number(),
    isActive: v.boolean(),
    /** When true, plan is excluded from public plan pickers (admin-only visibility). */
    isHidden: v.optional(v.boolean()),
    /** Max concurrent active subscribers; unset = unlimited. */
    maxCapacity: v.optional(v.number()),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_displayOrder", ["displayOrder", "deletedAt"])
    .index("by_includesPlanId", ["includesPlanId"])
    .index("by_deletedAt", ["deletedAt"]),

  subscriptionPlanPriceHistory: defineTable({
    planId: v.id("subscriptionPlans"),
    stripePriceId: v.string(),
    priceAmount: v.number(),
    priceCurrency: v.string(),
    archivedAt: v.number(),
    updatedBy: v.id("users"),
  }).index("by_planId", ["planId"]),

  personalTests: defineTable({
    name: v.string(),
    name_ar: v.string(),
    /** Combined name + name_ar for full-text search. */
    name_search: v.optional(v.string()),
    description: v.optional(v.string()),
    description_ar: v.optional(v.string()),
    thumbnail_image_url: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("disabled"),
    ),
    questionCount: v.number(),
    resultSettings: v.object({
      showAll: v.boolean(),
      maxCourses: v.optional(v.number()),
    }),
    /** JSON snapshot of the test when last published. */
    publishedSnapshot: v.optional(v.string()),
    /** True when draft edits exist that differ from the published snapshot. */
    hasUnpublishedChanges: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_deletedAt", ["deletedAt"])
    .index("by_deletedAt_status", ["deletedAt", "status"])
    .searchIndex("search_name", {
      searchField: "name_search",
      filterFields: ["deletedAt", "status"],
    }),

  personalTestQuestions: defineTable({
    testId: v.id("personalTests"),
    title: v.string(),
    title_ar: v.string(),
    answerType: v.union(v.literal("single"), v.literal("multi")),
    displayOrder: v.number(),
    createdAt: v.number(),
  })
    .index("by_testId", ["testId"])
    .index("by_testId_displayOrder", ["testId", "displayOrder"]),

  personalTestAnswers: defineTable({
    testId: v.id("personalTests"),
    questionId: v.id("personalTestQuestions"),
    text: v.string(),
    text_ar: v.string(),
    recommendedCourseIds: v.array(v.id("courses")),
    displayOrder: v.number(),
    createdAt: v.number(),
  })
    .index("by_questionId", ["questionId"])
    .index("by_testId", ["testId"]),

  personalTestAttempts: defineTable({
    testId: v.id("personalTests"),
    userId: v.id("users"),
    status: v.union(
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("abandoned"),
      v.literal("expired"),
    ),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    /** Whole seconds spent on the test; validated between 1 and 21600 (6 hours). */
    durationSeconds: v.optional(v.number()),
    selectedAnswerIds: v.optional(v.array(v.id("personalTestAnswers"))),
    recommendedCourseIds: v.optional(v.array(v.id("courses"))),
    /** Admin preview runs; excluded from user analytics by default. */
    isPreview: v.optional(v.boolean()),
  })
    .index("by_testId", ["testId"])
    .index("by_userId", ["userId"])
    .index("by_testId_userId", ["testId", "userId"])
    .index("by_testId_status", ["testId", "status"])
    .index("by_testId_status_completedAt", ["testId", "status", "completedAt"])
    .index("by_status_startedAt", ["status", "startedAt"]),
});
