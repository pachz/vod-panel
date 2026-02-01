import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";

import { requireUser } from "./utils/auth";
import {
  coachInputSchema,
  coachCreateSchema,
  type CoachInput,
  type CoachCreateInput,
} from "../shared/validation/coach";
import type { Doc, Id } from "./_generated/dataModel";

const coachDocValidator = v.object({
  _id: v.id("coaches"),
  _creationTime: v.number(),
  name: v.string(),
  name_ar: v.string(),
  expertise: v.string(),
  expertise_ar: v.string(),
  description: v.string(),
  description_ar: v.string(),
  rating: v.number(),
  profile_image_url: v.optional(v.string()),
  profile_thumbnail_url: v.optional(v.string()),
  course_count: v.number(), // Serialized with default 0
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
});

const defaultCoachSeed = {
  name: "Reham Diva",
  name_ar: "Reham Diva",
  expertise: "Confidence & Life Coach",
  expertise_ar: "Confidence & Life Coach",
  description:
    "Reham is a certified life coach with over 8 years of experience helping women build unshakeable confidence.",
  description_ar:
    "Reham is a certified life coach with over 8 years of experience helping women build unshakeable confidence.",
  rating: 4.9,
  profile_image_url: "/RehamDivaLogo.png",
  profile_thumbnail_url: "/RehamDivaLogo.png",
  course_count: 0,
};

const validateCoachInput = (input: CoachInput) => {
  const result = coachInputSchema.safeParse(input);

  if (!result.success) {
    const issue = result.error.errors[0];
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: issue?.message ?? "Invalid coach input.",
    });
  }

  return result.data;
};

const validateCoachCreateInput = (input: CoachCreateInput) => {
  const result = coachCreateSchema.safeParse(input);

  if (!result.success) {
    const issue = result.error.errors[0];
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: issue?.message ?? "Invalid coach input.",
    });
  }

  return result.data;
};

const fetchFirstCoach = async (ctx: QueryCtx | MutationCtx) => {
  const [doc] = await ctx.db
    .query("coaches")
    .withIndex("deletedAt", (q) => q.eq("deletedAt", undefined))
    .take(1);
  return doc ?? null;
};

const serializeCoach = (coach: Doc<"coaches">) => ({
  _id: coach._id,
  _creationTime: coach._creationTime,
  name: coach.name,
  name_ar: coach.name_ar,
  expertise: coach.expertise,
  expertise_ar: coach.expertise_ar,
  description: coach.description,
  description_ar: coach.description_ar,
  rating: coach.rating,
  profile_image_url: coach.profile_image_url,
  profile_thumbnail_url: coach.profile_thumbnail_url,
  course_count: coach.course_count ?? 0,
  createdAt: coach.createdAt,
  updatedAt: coach.updatedAt,
  deletedAt: coach.deletedAt,
});

// List all active coaches
export const listCoaches = query({
  args: {},
  returns: v.array(coachDocValidator),
  handler: async (ctx) => {
    await requireUser(ctx);
    const coaches = await ctx.db
      .query("coaches")
      .withIndex("deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();
    return coaches.map(serializeCoach);
  },
});

// List all deleted coaches
export const listDeletedCoaches = query({
  args: {},
  returns: v.array(coachDocValidator),
  handler: async (ctx) => {
    await requireUser(ctx);
    const coaches = await ctx.db
      .query("coaches")
      .withIndex("deletedAt", (q) => q.gt("deletedAt", 0))
      .collect();
    return coaches.map(serializeCoach);
  },
});

// Get a specific coach by ID
export const getCoachById = query({
  args: {
    id: v.id("coaches"),
  },
  returns: v.union(v.null(), coachDocValidator),
  handler: async (ctx, { id }) => {
    await requireUser(ctx);
    const coach = await ctx.db.get(id);
    if (!coach || coach.deletedAt) {
      return null;
    }
    return serializeCoach(coach);
  },
});

// Get the first coach (for legacy support)
export const getCoach = query({
  args: {},
  returns: v.union(v.null(), coachDocValidator),
  handler: async (ctx) => {
    await requireUser(ctx);
    const coach = await fetchFirstCoach(ctx);
    return coach ? serializeCoach(coach) : null;
  },
});

// Create a new coach
export const createCoach = mutation({
  args: {
    name: v.string(),
    nameAr: v.string(),
    description: v.string(),
    descriptionAr: v.string(),
  },
  returns: v.id("coaches"),
  handler: async (ctx, { name, nameAr, description, descriptionAr }) => {
    await requireUser(ctx);

    const validated = validateCoachCreateInput({
      name,
      nameAr,
      description,
      descriptionAr,
    });

    // Check for duplicate name
    const duplicates = await ctx.db
      .query("coaches")
      .withIndex("name_deletedAt", (q) => q.eq("name", validated.name))
      .collect();

    const hasDuplicate = duplicates.some((item) => item.deletedAt === undefined);

    if (hasDuplicate) {
      throw new ConvexError({
        code: "COACH_EXISTS",
        message: "A coach with this name already exists.",
      });
    }

    const now = Date.now();
    const coachId = await ctx.db.insert("coaches", {
      name: validated.name,
      name_ar: validated.nameAr,
      description: validated.description,
      description_ar: validated.descriptionAr,
      expertise: "General Coach",
      expertise_ar: "مدرب عام",
      rating: 3,
      course_count: 0,
      createdAt: now,
      updatedAt: now,
    });

    return coachId;
  },
});

// Ensure at least one coach exists (legacy support)
export const ensureCoach = mutation({
  args: {},
  returns: coachDocValidator,
  handler: async (ctx) => {
    await requireUser(ctx);

    const existing = await fetchFirstCoach(ctx);
    if (existing) {
      return serializeCoach(existing);
    }

    const now = Date.now();
    const coachId = await ctx.db.insert("coaches", {
      ...defaultCoachSeed,
      createdAt: now,
      updatedAt: now,
    });

    const coach = await ctx.db.get(coachId);
    if (!coach) {
      throw new ConvexError({
        code: "COACH_SEED_FAILED",
        message: "Unable to seed default coach.",
      });
    }

    return serializeCoach(coach);
  },
});

export const updateCoach = mutation({
  args: {
    id: v.id("coaches"),
    name: v.string(),
    nameAr: v.string(),
    expertise: v.string(),
    expertiseAr: v.string(),
    description: v.string(),
    descriptionAr: v.string(),
    rating: v.number(),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { id, name, nameAr, expertise, expertiseAr, description, descriptionAr, rating },
  ) => {
    await requireUser(ctx);

    const coach = await ctx.db.get(id);
    if (!coach || coach.deletedAt) {
      throw new ConvexError({
        code: "COACH_NOT_FOUND",
        message: "Coach record was not found.",
      });
    }

    validateCoachInput({
      name,
      nameAr,
      expertise,
      expertiseAr,
      description,
      descriptionAr,
      rating,
    });

    // Check for duplicate name (excluding current coach)
    const duplicates = await ctx.db
      .query("coaches")
      .withIndex("name_deletedAt", (q) => q.eq("name", name))
      .collect();

    const hasDuplicate = duplicates.some(
      (item) => item._id !== id && item.deletedAt === undefined
    );

    if (hasDuplicate) {
      throw new ConvexError({
        code: "COACH_EXISTS",
        message: "A coach with this name already exists.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(id, {
      name,
      name_ar: nameAr,
      expertise,
      expertise_ar: expertiseAr,
      description,
      description_ar: descriptionAr,
      rating,
      updatedAt: now,
    });

    return null;
  },
});

// Delete a coach (soft delete)
export const deleteCoach = mutation({
  args: {
    id: v.id("coaches"),
  },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireUser(ctx);

    const coach = await ctx.db.get(id);
    if (!coach || coach.deletedAt) {
      throw new ConvexError({
        code: "COACH_NOT_FOUND",
        message: "Coach record was not found.",
      });
    }

    // Check if coach has any courses assigned
    const courses = await ctx.db
      .query("courses")
      .withIndex("coach_id", (q) => q.eq("coach_id", id).eq("deletedAt", undefined))
      .collect();

    if (courses.length > 0) {
      throw new ConvexError({
        code: "COACH_HAS_COURSES",
        message: `Cannot delete coach that has ${courses.length} course${courses.length > 1 ? "s" : ""} assigned. Please reassign the courses first.`,
      });
    }

    const now = Date.now();
    await ctx.db.patch(id, {
      deletedAt: now,
      updatedAt: now,
    });

    return null;
  },
});

// Restore a deleted coach
export const restoreCoach = mutation({
  args: {
    id: v.id("coaches"),
  },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireUser(ctx);

    const coach = await ctx.db.get(id);
    if (!coach || !coach.deletedAt) {
      throw new ConvexError({
        code: "COACH_NOT_FOUND",
        message: "Deleted coach was not found.",
      });
    }

    // Check for duplicate name
    const duplicates = await ctx.db
      .query("coaches")
      .withIndex("name_deletedAt", (q) => q.eq("name", coach.name))
      .collect();

    const hasDuplicate = duplicates.some(
      (item) => item._id !== id && item.deletedAt === undefined
    );

    if (hasDuplicate) {
      throw new ConvexError({
        code: "COACH_EXISTS",
        message: "A coach with this name already exists. Cannot restore.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(id, {
      deletedAt: undefined,
      updatedAt: now,
    });

    return null;
  },
});

// Internal function to assign first coach to all courses without a coach
export const assignCoachToCoursesWithoutCoach = internalMutation({
  args: {},
  returns: v.object({
    assignedCount: v.number(),
    coachId: v.union(v.null(), v.id("coaches")),
  }),
  handler: async (ctx) => {
    // Get the first active coach
    const firstCoach = await fetchFirstCoach(ctx);
    if (!firstCoach) {
      return { assignedCount: 0, coachId: null };
    }

    // Get all courses without a coach
    const coursesWithoutCoach = await ctx.db
      .query("courses")
      .withIndex("deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();

    const coursesToUpdate = coursesWithoutCoach.filter(
      (course) => course.coach_id === undefined
    );

    // Assign the first coach to all courses without a coach
    const now = Date.now();
    for (const course of coursesToUpdate) {
      await ctx.db.patch(course._id, {
        coach_id: firstCoach._id,
        updatedAt: now,
      });
    }

    // Update the coach's course count
    if (coursesToUpdate.length > 0) {
      await ctx.db.patch(firstCoach._id, {
        course_count: (firstCoach.course_count ?? 0) + coursesToUpdate.length,
        updatedAt: now,
      });
    }

    return { assignedCount: coursesToUpdate.length, coachId: firstCoach._id };
  },
});

// Helper function to recalculate coach course count
export async function recalculateCoachCourseCount(
  ctx: MutationCtx,
  coachId: Id<"coaches">
) {
  const courses = await ctx.db
    .query("courses")
    .withIndex("coach_id", (q) => q.eq("coach_id", coachId).eq("deletedAt", undefined))
    .collect();

  await ctx.db.patch(coachId, {
    course_count: courses.length,
    updatedAt: Date.now(),
  });
}

export const generateImageUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateCoachImage = mutation({
  args: {
    id: v.id("coaches"),
    profileImageStorageId: v.optional(v.id("_storage")),
    profileThumbnailStorageId: v.optional(v.id("_storage")),
  },
  returns: v.object({
    profileImageUrl: v.union(v.null(), v.string()),
    profileThumbnailUrl: v.union(v.null(), v.string()),
  }),
  handler: async (ctx, { id, profileImageStorageId, profileThumbnailStorageId }) => {
    await requireUser(ctx);

    const coach = await ctx.db.get(id);
    if (!coach) {
      throw new ConvexError({
        code: "COACH_NOT_FOUND",
        message: "Coach record was not found.",
      });
    }

    const patch: Partial<typeof coach> = {};
    let profileImageUrl = coach.profile_image_url ?? null;
    let profileThumbnailUrl = coach.profile_thumbnail_url ?? null;

    if (profileImageStorageId) {
      const url = await ctx.storage.getUrl(profileImageStorageId);
      if (!url) {
        throw new ConvexError({
          code: "STORAGE_ERROR",
          message: "Could not generate profile image URL.",
        });
      }
      patch.profile_image_url = url;
      profileImageUrl = url;
    }

    if (profileThumbnailStorageId) {
      const url = await ctx.storage.getUrl(profileThumbnailStorageId);
      if (!url) {
        throw new ConvexError({
          code: "STORAGE_ERROR",
          message: "Could not generate profile thumbnail URL.",
        });
      }
      patch.profile_thumbnail_url = url;
      profileThumbnailUrl = url;
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = Date.now();
      await ctx.db.patch(id, patch);
    }

    return {
      profileImageUrl,
      profileThumbnailUrl,
    };
  },
});


