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
    deletedAt: v.optional(v.number()),
    stripeCustomerId: v.optional(v.string()), // Stripe customer ID
  })
    .index("email", ["email", "deletedAt"])
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("subscriptionId", ["subscriptionId"])
    .index("userId", ["userId"])
    .index("status", ["status"]),

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
});
