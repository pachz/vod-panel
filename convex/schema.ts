import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
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
    .index("stripeCustomerId", ["stripeCustomerId"]),

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

  courses: defineTable({
    name: v.string(),
    name_ar: v.string(),
    description: v.optional(v.string()),
    description_ar: v.optional(v.string()),
    short_description: v.optional(v.string()),
    short_description_ar: v.optional(v.string()),
    slug: v.string(),
    category_id: v.id("categories"),
    trial_video_url: v.optional(v.string()),
    duration: v.optional(v.number()),
    status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
    banner_image_url: v.optional(v.string()),
    thumbnail_image_url: v.optional(v.string()),
    instructor: v.optional(v.string()),
    lesson_count: v.number(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("name", ["name", "deletedAt"])
    .index("slug", ["slug"])
    .index("deletedAt_category_status", ["deletedAt", "category_id", "status"])
    .index("deletedAt_status", ["deletedAt", "status"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["deletedAt", "category_id", "status"],
    }),

  lessons: defineTable({
    title: v.string(),
    title_ar: v.string(),
    short_review: v.string(),
    short_review_ar: v.string(),
    description: v.optional(v.string()),
    description_ar: v.optional(v.string()),
    learning_objectives: v.optional(v.string()),
    learning_objectives_ar: v.optional(v.string()),
    course_id: v.id("courses"),
    duration: v.optional(v.number()),
    type: v.union(v.literal("video"), v.literal("article")),
    status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
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
    .index("deletedAt_course_status", ["deletedAt", "course_id", "status"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["deletedAt", "course_id", "status"],
    }),

  coaches: defineTable({
    name: v.string(),
    name_ar: v.string(),
    expertise: v.string(),
    expertise_ar: v.string(),
    description: v.string(),
    description_ar: v.string(),
    rating: v.number(),
    profile_image_url: v.string(),
    profile_thumbnail_url: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("subscriptionId", ["subscriptionId"])
    .index("userId", ["userId"])
    .index("status", ["status"]),

  paymentSettings: defineTable({
    selectedProductId: v.string(), // Stripe product ID
    selectedPriceId: v.string(), // Stripe price ID
    productName: v.string(),
    priceAmount: v.number(), // Amount in cents
    priceCurrency: v.string(),
    priceInterval: v.union(v.literal("month"), v.literal("year"), v.literal("week"), v.literal("day")),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("selectedProductId", ["selectedProductId"]),
});
