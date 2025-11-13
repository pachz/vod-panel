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
  }).index("email", ["email", "deletedAt"]),

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
    short_description: v.string(),
    short_description_ar: v.string(),
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
    deletedAt: v.optional(v.number()),
  })
    .index("name", ["name", "deletedAt"])
    .index("slug", ["slug"]),
});
