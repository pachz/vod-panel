import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  videos: defineTable({
    url: v.string(),
    createdAt: v.number(),
  }),
});
