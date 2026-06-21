import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";

const planFeatureValidator = v.object({
  icon: v.string(),
  title: v.string(),
  title_ar: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  subtitle_ar: v.optional(v.string()),
  isChecklistItem: v.boolean(),
  displayOrder: v.number(),
});

const planThemeValidator = v.object({
  primary: v.string(),
  secondary: v.string(),
  border: v.string(),
  headerBg: v.string(),
  buttonBg: v.string(),
});

export const planDocValidator = v.object({
  _id: v.id("subscriptionPlans"),
  _creationTime: v.number(),
  name: v.string(),
  name_ar: v.string(),
  slug: v.string(),
  billingInterval: v.union(v.literal("month"), v.literal("year")),
  stripeProductId: v.string(),
  stripePriceId: v.string(),
  priceAmount: v.number(),
  priceCurrency: v.string(),
  compareAtPriceAmount: v.optional(v.number()),
  priceSubtitle: v.optional(v.string()),
  theme: planThemeValidator,
  badgeTag: v.union(
    v.literal("start_here"),
    v.literal("best_value"),
    v.literal("most_popular"),
    v.literal("limited"),
    v.literal("vip"),
    v.literal("none"),
  ),
  ribbonText: v.optional(v.string()),
  includesPlanId: v.optional(v.id("subscriptionPlans")),
  includeAllCourses: v.boolean(),
  includedCourseIds: v.array(v.id("courses")),
  includedCategoryIds: v.array(v.id("categories")),
  resolvedCourseIds: v.array(v.id("courses")),
  features: v.array(planFeatureValidator),
  displayOrder: v.number(),
  isActive: v.boolean(),
  updatedBy: v.id("users"),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
});

function isPublishedCourse(course: Doc<"courses">): boolean {
  return course.deletedAt === undefined && course.status === "published";
}

async function collectCoursesForCategories(
  ctx: MutationCtx,
  categoryIds: Id<"categories">[],
): Promise<Set<Id<"courses">>> {
  const result = new Set<Id<"courses">>();
  if (categoryIds.length === 0) {
    return result;
  }

  const categorySet = new Set(categoryIds);

  for (const categoryId of categoryIds) {
    const byPrimary = await ctx.db
      .query("courses")
      .withIndex("deletedAt_category_status", (q) =>
        q.eq("deletedAt", undefined).eq("category_id", categoryId).eq("status", "published"),
      )
      .collect();
    for (const course of byPrimary) {
      result.add(course._id);
    }
  }

  const publishedCourses = await ctx.db
    .query("courses")
    .withIndex("deletedAt_status", (q) =>
      q.eq("deletedAt", undefined).eq("status", "published"),
    )
    .collect();

  for (const course of publishedCourses) {
    const additional = course.additional_category_ids ?? [];
    if (additional.some((id) => categorySet.has(id))) {
      result.add(course._id);
    }
  }

  return result;
}

async function collectAllPublishedCourses(ctx: MutationCtx): Promise<Set<Id<"courses">>> {
  const result = new Set<Id<"courses">>();
  const courses = await ctx.db
    .query("courses")
    .withIndex("deletedAt_status", (q) =>
      q.eq("deletedAt", undefined).eq("status", "published"),
    )
    .collect();
  for (const course of courses) {
    result.add(course._id);
  }
  return result;
}

async function computeOwnCourseIds(
  ctx: MutationCtx,
  plan: Doc<"subscriptionPlans">,
): Promise<Set<Id<"courses">>> {
  if (plan.includeAllCourses) {
    return collectAllPublishedCourses(ctx);
  }

  const result = new Set<Id<"courses">>();

  for (const courseId of plan.includedCourseIds) {
    const course = await ctx.db.get(courseId);
    if (course && isPublishedCourse(course)) {
      result.add(courseId);
    }
  }

  const fromCategories = await collectCoursesForCategories(ctx, plan.includedCategoryIds);
  for (const id of fromCategories) {
    result.add(id);
  }

  return result;
}

async function resolveWithInheritance(
  ctx: MutationCtx,
  plan: Doc<"subscriptionPlans">,
  visited: Set<Id<"subscriptionPlans">> = new Set(),
): Promise<Id<"courses">[]> {
  if (visited.has(plan._id)) {
    return [];
  }
  visited.add(plan._id);

  const ownIds = await computeOwnCourseIds(ctx, plan);
  const merged = new Set(ownIds);

  if (plan.includesPlanId) {
    const parent = await ctx.db.get(plan.includesPlanId);
    if (parent && parent.deletedAt === undefined) {
      const parentIds = await resolveWithInheritance(ctx, parent, visited);
      for (const id of parentIds) {
        merged.add(id);
      }
    }
  }

  return [...merged].sort();
}

export const resolvePlanCourses = internalMutation({
  args: { planId: v.id("subscriptionPlans") },
  returns: v.null(),
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get(planId);
    if (!plan || plan.deletedAt !== undefined) {
      return null;
    }

    const resolvedCourseIds = await resolveWithInheritance(ctx, plan);
    await ctx.db.patch(planId, { resolvedCourseIds });
    return null;
  },
});

export const cascadeResolveChildPlans = internalMutation({
  args: { parentPlanId: v.id("subscriptionPlans") },
  returns: v.null(),
  handler: async (ctx, { parentPlanId }) => {
    const children = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_includesPlanId", (q) => q.eq("includesPlanId", parentPlanId))
      .collect();

    for (const child of children) {
      if (child.deletedAt !== undefined) {
        continue;
      }
      const resolvedCourseIds = await resolveWithInheritance(ctx, child);
      await ctx.db.patch(child._id, { resolvedCourseIds });

      const grandchildren = await ctx.db
        .query("subscriptionPlans")
        .withIndex("by_includesPlanId", (q) => q.eq("includesPlanId", child._id))
        .collect();
      for (const grandchild of grandchildren) {
        if (grandchild.deletedAt !== undefined) {
          continue;
        }
        const gcResolved = await resolveWithInheritance(ctx, grandchild);
        await ctx.db.patch(grandchild._id, { resolvedCourseIds: gcResolved });
      }
    }
    return null;
  },
});

async function planNeedsRecomputeForCourse(
  plan: Doc<"subscriptionPlans">,
  courseId: Id<"courses">,
  categoryIds: Id<"categories">[],
): Promise<boolean> {
  if (plan.deletedAt !== undefined) {
    return false;
  }
  if (plan.includeAllCourses) {
    return true;
  }
  if (plan.includedCourseIds.includes(courseId)) {
    return true;
  }
  const categorySet = new Set(categoryIds);
  return plan.includedCategoryIds.some((id) => categorySet.has(id));
}

export const recomputePlansForCourse = internalMutation({
  args: { courseId: v.id("courses") },
  returns: v.null(),
  handler: async (ctx, { courseId }) => {
    const course = await ctx.db.get(courseId);
    const categoryIds: Id<"categories">[] = course
      ? [course.category_id, ...(course.additional_category_ids ?? [])]
      : [];

    const plans = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();

    const affectedPlanIds = new Set<Id<"subscriptionPlans">>();

    for (const plan of plans) {
      const needs =
        !course ||
        planNeedsRecomputeForCourse(plan, courseId, categoryIds) ||
        plan.resolvedCourseIds.includes(courseId);
      if (needs) {
        affectedPlanIds.add(plan._id);
      }
    }

    for (const planId of affectedPlanIds) {
      const plan = await ctx.db.get(planId);
      if (!plan || plan.deletedAt !== undefined) {
        continue;
      }
      const resolvedCourseIds = await resolveWithInheritance(ctx, plan);
      await ctx.db.patch(planId, { resolvedCourseIds });
      await cascadeResolveChildPlansHandler(ctx, planId);
    }
    return null;
  },
});

async function cascadeResolveChildPlansHandler(
  ctx: MutationCtx,
  parentPlanId: Id<"subscriptionPlans">,
): Promise<void> {
  const children = await ctx.db
    .query("subscriptionPlans")
    .withIndex("by_includesPlanId", (q) => q.eq("includesPlanId", parentPlanId))
    .collect();

  for (const child of children) {
    if (child.deletedAt !== undefined) {
      continue;
    }
    const resolvedCourseIds = await resolveWithInheritance(ctx, child);
    await ctx.db.patch(child._id, { resolvedCourseIds });

    const grandchildren = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_includesPlanId", (q) => q.eq("includesPlanId", child._id))
      .collect();
    for (const grandchild of grandchildren) {
      if (grandchild.deletedAt !== undefined) {
        continue;
      }
      const gcResolved = await resolveWithInheritance(ctx, grandchild);
      await ctx.db.patch(grandchild._id, { resolvedCourseIds: gcResolved });
    }
  }
}

export const recomputePlansForCategory = internalMutation({
  args: { categoryId: v.id("categories") },
  returns: v.null(),
  handler: async (ctx, { categoryId }) => {
    const plans = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();

    for (const plan of plans) {
      const affected =
        plan.includeAllCourses ||
        plan.includedCategoryIds.includes(categoryId);
      if (!affected) {
        continue;
      }
      const resolvedCourseIds = await resolveWithInheritance(ctx, plan);
      await ctx.db.patch(plan._id, { resolvedCourseIds });
      await cascadeResolveChildPlansHandler(ctx, plan._id);
    }
    return null;
  },
});

export const insertPlanRecord = internalMutation({
  args: {
    name: v.string(),
    name_ar: v.string(),
    slug: v.string(),
    billingInterval: v.union(v.literal("month"), v.literal("year")),
    stripeProductId: v.string(),
    stripePriceId: v.string(),
    priceAmount: v.number(),
    priceCurrency: v.string(),
    compareAtPriceAmount: v.optional(v.number()),
    priceSubtitle: v.optional(v.string()),
    theme: planThemeValidator,
    badgeTag: v.union(
      v.literal("start_here"),
      v.literal("best_value"),
      v.literal("most_popular"),
      v.literal("limited"),
      v.literal("vip"),
      v.literal("none"),
    ),
    ribbonText: v.optional(v.string()),
    includesPlanId: v.optional(v.id("subscriptionPlans")),
    includeAllCourses: v.boolean(),
    includedCourseIds: v.array(v.id("courses")),
    includedCategoryIds: v.array(v.id("categories")),
    features: v.array(planFeatureValidator),
    displayOrder: v.number(),
    isActive: v.boolean(),
    updatedBy: v.id("users"),
  },
  returns: v.id("subscriptionPlans"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const planId = await ctx.db.insert("subscriptionPlans", {
      ...args,
      resolvedCourseIds: [],
      updatedAt: now,
    });

    const plan = await ctx.db.get(planId);
    if (plan) {
      const resolvedCourseIds = await resolveWithInheritance(ctx, plan);
      await ctx.db.patch(planId, { resolvedCourseIds });
      await cascadeResolveChildPlansHandler(ctx, planId);
    }

    return planId;
  },
});

export const patchPlanRecord = internalMutation({
  args: {
    planId: v.id("subscriptionPlans"),
    name: v.string(),
    name_ar: v.string(),
    slug: v.string(),
    compareAtPriceAmount: v.optional(v.number()),
    priceSubtitle: v.optional(v.string()),
    theme: planThemeValidator,
    badgeTag: v.union(
      v.literal("start_here"),
      v.literal("best_value"),
      v.literal("most_popular"),
      v.literal("limited"),
      v.literal("vip"),
      v.literal("none"),
    ),
    ribbonText: v.optional(v.string()),
    includesPlanId: v.optional(v.id("subscriptionPlans")),
    includeAllCourses: v.boolean(),
    includedCourseIds: v.array(v.id("courses")),
    includedCategoryIds: v.array(v.id("categories")),
    features: v.array(planFeatureValidator),
    displayOrder: v.number(),
    isActive: v.boolean(),
    updatedBy: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { planId, ...fields }) => {
    const now = Date.now();
    await ctx.db.patch(planId, { ...fields, updatedAt: now });

    const plan = await ctx.db.get(planId);
    if (plan && plan.deletedAt === undefined) {
      const resolvedCourseIds = await resolveWithInheritance(ctx, plan);
      await ctx.db.patch(planId, { resolvedCourseIds });
      await cascadeResolveChildPlansHandler(ctx, planId);
    }
    return null;
  },
});

export const insertArchivedPriceHistory = internalMutation({
  args: {
    planId: v.id("subscriptionPlans"),
    stripePriceId: v.string(),
    priceAmount: v.number(),
    priceCurrency: v.string(),
    updatedBy: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("subscriptionPlanPriceHistory", {
      planId: args.planId,
      stripePriceId: args.stripePriceId,
      priceAmount: args.priceAmount,
      priceCurrency: args.priceCurrency,
      archivedAt: Date.now(),
      updatedBy: args.updatedBy,
    });
    return null;
  },
});

export const patchPlanPrice = internalMutation({
  args: {
    planId: v.id("subscriptionPlans"),
    stripePriceId: v.string(),
    priceAmount: v.number(),
    priceCurrency: v.string(),
    updatedBy: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.planId, {
      stripePriceId: args.stripePriceId,
      priceAmount: args.priceAmount,
      priceCurrency: args.priceCurrency,
      updatedBy: args.updatedBy,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const archivePlanRecord = internalMutation({
  args: {
    planId: v.id("subscriptionPlans"),
    updatedBy: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { planId, updatedBy }) => {
    const now = Date.now();
    await ctx.db.patch(planId, {
      deletedAt: now,
      isActive: false,
      updatedBy,
      updatedAt: now,
    });
    return null;
  },
});

export const validateNewPlanInternal = internalQuery({
  args: {
    slug: v.string(),
    includesPlanId: v.optional(v.id("subscriptionPlans")),
  },
  returns: v.null(),
  handler: async (ctx, { slug, includesPlanId }) => {
    const existing = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();
    const conflict = existing.find((p) => p.deletedAt === undefined);
    if (conflict) {
      throw new Error("A plan with this slug already exists.");
    }

    if (includesPlanId) {
      const parent = await ctx.db.get(includesPlanId);
      if (!parent || parent.deletedAt !== undefined) {
        throw new Error("Parent plan not found.");
      }
      let depth = 0;
      let currentId: typeof includesPlanId | undefined = includesPlanId;
      while (currentId) {
        const node: Doc<"subscriptionPlans"> | null = await ctx.db.get(currentId);
        if (!node?.includesPlanId) {
          break;
        }
        depth++;
        currentId = node.includesPlanId;
      }
      if (depth >= 2) {
        throw new Error("Maximum inheritance depth is 2 levels.");
      }
    }
    return null;
  },
});

export const validatePlanUpdateInternal = internalQuery({
  args: {
    planId: v.id("subscriptionPlans"),
    slug: v.string(),
    includesPlanId: v.optional(v.id("subscriptionPlans")),
  },
  returns: v.null(),
  handler: async (ctx, { planId, slug, includesPlanId }) => {
    const existing = await ctx.db
      .query("subscriptionPlans")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();
    const conflict = existing.find(
      (p) => p.deletedAt === undefined && p._id !== planId,
    );
    if (conflict) {
      throw new Error("A plan with this slug already exists.");
    }

    if (includesPlanId) {
      if (includesPlanId === planId) {
        throw new Error("A plan cannot inherit from itself.");
      }
      const parent = await ctx.db.get(includesPlanId);
      if (!parent || parent.deletedAt !== undefined) {
        throw new Error("Parent plan not found.");
      }
      let depth = 0;
      let currentId: typeof includesPlanId | undefined = includesPlanId;
      while (currentId) {
        if (currentId === planId) {
          throw new Error("Plan inheritance cannot form a cycle.");
        }
        const node: Doc<"subscriptionPlans"> | null = await ctx.db.get(currentId);
        if (!node?.includesPlanId) {
          break;
        }
        depth++;
        currentId = node.includesPlanId;
      }
      if (depth >= 2) {
        throw new Error("Maximum inheritance depth is 2 levels.");
      }
    }
    return null;
  },
});

export const getPlanByIdInternal = internalQuery({
  args: { planId: v.id("subscriptionPlans") },
  returns: v.union(planDocValidator, v.null()),
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      return null;
    }
    return plan;
  },
});
