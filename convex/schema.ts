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
    name_ar: v.optional(v.string()),
    description: v.optional(v.string()),
    description_ar: v.optional(v.string()),
    slug: v.string(),
    course_count: v.number(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  }).index("name", ["name", "deletedAt"]),
});
