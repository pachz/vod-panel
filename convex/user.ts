import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx, ActionCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";

import {
  userInputSchema,
  userUpdateSchema,
  userPasswordUpdateSchema,
  type UserInput,
  type UserUpdateInput,
  type UserPasswordUpdateInput,
} from "../shared/validation/user";
import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireUser, requireUserAction } from "./utils/auth";
import { logActivity } from "./utils/activityLog";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

/** Build searchable string from name + email for full-text search. */
function buildNameSearch(name?: string | null, email?: string | null): string | undefined {
  const parts = [(name ?? "").trim(), (email ?? "").trim()].filter(Boolean);
  const value = parts.join(" ").trim();
  return value || undefined;
}

export const getCurrentUser = query(async (ctx) => {
  const { identity } = await requireUser(ctx);
  
  if (!identity) {
    return null;
  }

  const userId = await getAuthUserId(ctx);
  
  if (!userId) {
    return null;
  }

  const user = await ctx.db.get(userId as Id<"users">);
  
  if (!user || user.deletedAt) {
    return null;
  }

  return user;
});

// Safe version that doesn't throw when unauthenticated - for use in components
// that need to check user state without requiring authentication
export const getCurrentUserSafe = query(async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }

  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }

  const user = await ctx.db.get(userId as Id<"users">);
  if (!user || user.deletedAt) {
    return null;
  }

  return user;
});

export const listUsers = query(async (ctx) => {
  await requireUser(ctx, { requireGod: true });

  const users = await ctx.db.query("users").collect();

  return users
    .filter((user) => user.deletedAt === undefined)
    .sort((a, b) => {
      // Sort admins first, then by name
      if (a.isGod !== b.isGod) {
        return a.isGod ? -1 : 1;
      }
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
});

const PAGE_SIZE = 25;

/**
 * Paginated list of users (admin only). Uses index for scalability.
 * Pass isGod to filter by role: true = admins only, false = regular only, undefined = all.
 */
export const listUsersPaginated = query({
  args: {
    numItems: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    isGod: v.optional(v.boolean()),
  },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("users"),
        _creationTime: v.number(),
        name: v.optional(v.string()),
        email: v.optional(v.string()),
        name_search: v.optional(v.string()),
        phone: v.optional(v.string()),
        image: v.optional(v.string()),
        emailVerificationTime: v.optional(v.number()),
        phoneVerificationTime: v.optional(v.number()),
        isAnonymous: v.optional(v.boolean()),
        isGod: v.optional(v.boolean()),
        deletedAt: v.optional(v.number()),
        stripeCustomerId: v.optional(v.string()),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGod: true });

    const numItems = Math.min(Math.max(args.numItems ?? PAGE_SIZE, 1), 100);

    if (args.isGod === true || args.isGod === false) {
      const result = await ctx.db
        .query("users")
        .withIndex("by_deletedAt_isGod", (q) =>
          q.eq("deletedAt", undefined).eq("isGod", args.isGod!),
        )
        .order("desc")
        .paginate({
          numItems,
          cursor: args.cursor ?? null,
        });
      return {
        page: result.page,
        isDone: result.isDone,
        continueCursor: result.continueCursor,
      };
    }

    const result = await ctx.db
      .query("users")
      .withIndex("by_deletedAt", (q) =>
        q.eq("deletedAt", undefined),
      )
      .order("desc")
      .paginate({
        numItems,
        cursor: args.cursor ?? null,
      });

    return {
      page: result.page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/**
 * Returns total counts of regular users and admins (admin only). Used for tab badges.
 */
export const getUsersCounts = query({
  args: {},
  returns: v.object({
    regular: v.number(),
    admin: v.number(),
  }),
  handler: async (ctx) => {
    await requireUser(ctx, { requireGod: true });

    const users = await ctx.db
      .query("users")
      .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
      .collect();

    let regular = 0;
    let admin = 0;
    for (const u of users) {
      // Align semantics with listUsersPaginated:
      // - "Admins" are users with isGod === true
      // - "Regular" users are users with isGod === false
      // Users where isGod is undefined are excluded from both counts,
      // matching how they are excluded from both paginated lists.
      if (u.isGod === true) {
        admin += 1;
      } else if (u.isGod === false) {
        regular += 1;
      }
    }
    return { regular, admin };
  },
});

/**
 * Search users by name or email (admin only). Uses full-text search on name_search.
 */
export const searchUsers = query({
  args: {
    searchTerm: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      name_search: v.optional(v.string()),
      phone: v.optional(v.string()),
      image: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      phoneVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      isGod: v.optional(v.boolean()),
      deletedAt: v.optional(v.number()),
      stripeCustomerId: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGod: true });

    const term = args.searchTerm.trim();
    if (!term) {
      return [];
    }

    const limit = Math.min(args.limit ?? 50, 100);
    const users = await ctx.db
      .query("users")
      .withSearchIndex("search_name", (q) =>
        q.search("name_search", term).eq("deletedAt", undefined),
      )
      .take(limit);

    return users;
  },
});

/**
 * Returns subscription status for the given user IDs (admin only).
 * Used by the Users table to show Active / None badges.
 */
export const getSubscriptionStatusForUsers = query({
  args: {
    userIds: v.array(v.id("users")),
  },
  returns: v.record(v.string(), v.union(v.literal("active"), v.literal("none"))),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGod: true });

    const result: Record<string, "active" | "none"> = {};
    for (const userId of args.userIds) {
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .order("desc")
        .first();
      result[userId] = sub && ACTIVE_SUBSCRIPTION_STATUSES.has(sub.status) ? "active" : "none";
    }
    return result;
  },
});

export const getUser = query({
  args: {
    id: v.id("users"),
  },
  handler: async (ctx, { id }) => {
    await requireUser(ctx, { requireGod: true });

    const user = await ctx.db.get(id);

    if (!user || user.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found.",
      });
    }

    return user;
  },
});

// Internal query to get user by ID
export const getUserById = internalQuery({
  args: {
    id: v.id("users"),
  },
  handler: async (ctx, { id }) => {
    const user = await ctx.db.get(id);
    return user;
  },
});

// Internal query to get current user
export const getCurrentUserInternal = internalQuery({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    
    if (!identity) {
      return null;
    }

    const userId = await getAuthUserId(ctx);
    
    if (!userId) {
      return null;
    }

    const user = await ctx.db.get(userId as Id<"users">);
    
    if (!user || user.deletedAt) {
      return null;
    }

    return user;
  },
});

// Internal query to check if user is admin (for use in actions)
export const requireAdminQuery = internalQuery({
  handler: async (ctx) => {
    const result = await requireUser(ctx, { requireGod: true });
    return result;
  },
});

// Internal query to check if user is admin by email (legacy, kept for backwards compatibility)
export const checkAdmin = internalQuery({
  args: {
    email: v.string(),
  },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email).eq("deletedAt", undefined))
      .first();

    return user && user.isGod ? user : null;
  },
});

// Internal query to get user by email
export const getUserByEmail = internalQuery({
  args: {
    email: v.string(),
  },
  handler: async (ctx, { email }) => {
    const allUsers = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .collect();
    
    const existing = allUsers.find((u) => !u.deletedAt);
    return existing ?? null;
  },
});

const validateUserInput = (input: UserInput) => {
  const result = userInputSchema.safeParse(input);

  if (!result.success) {
    const issue = result.error.errors[0];
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: issue?.message ?? "Invalid user input.",
    });
  }

  return result.data;
};

const validateUserUpdateInput = (input: UserUpdateInput) => {
  const result = userUpdateSchema.safeParse(input);

  if (!result.success) {
    const issue = result.error.errors[0];
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: issue?.message ?? "Invalid user input.",
    });
  }

  return result.data;
};

const validateUserPasswordUpdateInput = (input: UserPasswordUpdateInput) => {
  const result = userPasswordUpdateSchema.safeParse(input);

  if (!result.success) {
    const issue = result.error.errors[0];
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: issue?.message ?? "Invalid password input.",
    });
  }

  return result.data;
};

// Internal mutation to create user record
export const createUserRecord = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    isAdmin: v.boolean(),
  },
  handler: async (ctx, args) => {
    const phone = args.phone && args.phone.trim() ? args.phone.trim() : undefined;

    // Check if user with this email already exists
    const allUsers = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .collect();
    
    const existing = allUsers.find((u) => !u.deletedAt);

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email,
        name_search: buildNameSearch(args.name, args.email),
        phone,
        isGod: args.isAdmin,
        emailVerificationTime: existing.emailVerificationTime ?? Date.now(),
        deletedAt: undefined,
      });

      await logActivity({
        ctx,
        entityType: "user",
        action: "created",
        entityId: existing._id,
        entityName: args.name || args.email,
      });

      return existing._id;
    }

    // Create user in users table
    const userId = await ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      name_search: buildNameSearch(args.name, args.email),
      phone,
      isGod: args.isAdmin,
      emailVerificationTime: Date.now(), // Auto-verify for admin-created users
    });

    await logActivity({
      ctx,
      entityType: "user",
      action: "created",
      entityId: userId,
      entityName: args.name || args.email,
    });

    return userId;
  },
});

/** Internal mutation to backfill name_search for all users. Run from dashboard or scheduler. */
export const backfillNameSearch = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let updated = 0;
    for (const user of users) {
      const name_search = buildNameSearch(user.name, user.email);
      if (name_search !== user.name_search) {
        await ctx.db.patch(user._id, { name_search });
        updated += 1;
      }
    }
    return updated;
  },
});

// Public action for user registration (no auth required)
export const registerUser = action({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, { name, email, password }) => {
    const validated = validateUserInput({
      name,
      email,
      phone: undefined,
      password,
      isAdmin: false,
    });

    // Check if user already exists before creating auth account
    const existingUser = await ctx.runQuery(internal.user.getUserByEmail, {
      email: validated.email,
    });
    
    if (existingUser) {
      throw new ConvexError({
        code: "USER_EXISTS",
        message: "A user with this email already exists.",
      });
    }

    // Create auth account first
    try {
      await ctx.runAction(internal.auth.createAuthAccount, {
        email: validated.email,
        name: validated.name,
        password: validated.password,
      });
    } catch (error) {
      // Re-throw ConvexError as-is
      if (error instanceof ConvexError) {
        throw error;
      }
      // Wrap other errors
      throw new ConvexError({
        code: "AUTH_CREATION_FAILED",
        message: "Failed to create authentication account. Please try again.",
      });
    }

    // Create user in users table using internal mutation
    const userId: Id<"users"> = await ctx.runMutation(internal.user.createUserRecord, {
      name: validated.name,
      email: validated.email,
      phone: undefined,
      isAdmin: false,
    });

    return userId;
  },
});

// Action to create user (can call both actions and mutations)
export const createUser = action({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    password: v.string(),
    isAdmin: v.optional(v.boolean()),
  },
  handler: async (ctx, { name, email, phone, password, isAdmin }) => {
    // Check auth and admin status
    await requireUserAction(ctx);
    await ctx.runQuery(internal.user.requireAdminQuery);

    const validated = validateUserInput({
      name,
      email,
      phone,
      password,
      isAdmin: isAdmin ?? false,
    });

    // Check if user already exists before creating auth account
    const existingUser = await ctx.runQuery(internal.user.getUserByEmail, {
      email: validated.email,
    });
    
    if (existingUser) {
      throw new ConvexError({
        code: "USER_EXISTS",
        message: "A user with this email already exists.",
      });
    }

    // Create auth account first
    try {
      await ctx.runAction(internal.auth.createAuthAccount, {
        email: validated.email,
        name: validated.name,
        password: validated.password,
      });
    } catch (error) {
      // Re-throw ConvexError as-is
      if (error instanceof ConvexError) {
        throw error;
      }
      // Wrap other errors
      throw new ConvexError({
        code: "AUTH_CREATION_FAILED",
        message: "Failed to create authentication account. Please try again.",
      });
    }

    // Create user in users table using internal mutation
    const userId: Id<"users"> = await ctx.runMutation(internal.user.createUserRecord, {
      name: validated.name,
      email: validated.email,
      phone: validated.phone,
      isAdmin: validated.isAdmin,
    });

    return userId;
  },
});

export const updateUser = mutation({
  args: {
    id: v.id("users"),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    isAdmin: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, name, email, phone, isAdmin }) => {
    const { user: currentUser } = (await requireUser(ctx, {
      requireGod: true,
    })) as { identity: any; user: any };

    const user = await ctx.db.get(id);

    if (!user || user.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found.",
      });
    }

    const validated = validateUserUpdateInput({
      name,
      email,
      phone,
      isAdmin: isAdmin ?? false,
    });

    // Prevent email changes
    if (validated.email !== user.email) {
      throw new ConvexError({
        code: "EMAIL_CHANGE_NOT_ALLOWED",
        message: "Editing user's email is not allowed.",
      });
    }

    // Prevent admins from changing their own role
    if (user._id === currentUser._id && validated.isAdmin !== user.isGod) {
      throw new ConvexError({
        code: "CANNOT_CHANGE_SELF_ROLE",
        message: "You cannot change your own administrator status.",
      });
    }

    await ctx.db.patch(id, {
      name: validated.name,
      email: validated.email,
      name_search: buildNameSearch(validated.name, validated.email),
      phone: validated.phone && validated.phone.trim() ? validated.phone.trim() : undefined,
      isGod: validated.isAdmin ?? false,
    });

    await logActivity({
      ctx,
      entityType: "user",
      action: "updated",
      entityId: id,
      entityName: validated.name || validated.email,
    });
  },
});

export const updateUserRole = mutation({
  args: {
    id: v.id("users"),
    isAdmin: v.boolean(),
  },
  handler: async (ctx, { id, isAdmin }) => {
    const { user: currentUser } = (await requireUser(ctx, {
      requireGod: true,
    })) as { identity: any; user: any };

    if (currentUser._id === id) {
      throw new ConvexError({
        code: "CANNOT_CHANGE_SELF_ROLE",
        message: "You cannot change your own administrator status.",
      });
    }

    const user = await ctx.db.get(id);

    if (!user || user.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found.",
      });
    }

    if (!!user.isGod === isAdmin) {
      return;
    }

    await ctx.db.patch(id, {
      isGod: isAdmin,
    });

    await logActivity({
      ctx,
      entityType: "user",
      action: "updated",
      entityId: id,
      entityName: user.name || user.email || "User",
    });
  },
});

// Action to change current user's password
export const changeMyPassword = action({
  args: {
    newPassword: v.string(),
  },
  handler: async (ctx, { newPassword }) => {
    // Check auth
    await requireUserAction(ctx);
    
    // Get current user
    const currentUser = await ctx.runQuery(internal.user.getCurrentUserInternal);
    
    if (!currentUser || currentUser.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found.",
      });
    }

    if (!currentUser.email) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "User email not found.",
      });
    }

    const validated = validateUserPasswordUpdateInput({ password: newPassword });

    // Update or set password in auth system (sets password for OAuth-only users)
    await ctx.runAction(internal.auth.setUserPassword, {
      email: currentUser.email,
      password: validated.password,
      name: currentUser.name,
    });
  },
});

// Action to update user password (needs to call auth action)
export const updateUserPassword = action({
  args: {
    id: v.id("users"),
    password: v.string(),
  },
  handler: async (ctx, { id, password }) => {
    // Check auth and admin status
    await requireUserAction(ctx);
    const { user: currentUser } = await ctx.runQuery(internal.user.requireAdminQuery) as { identity: any; user: any };

    // Get user
    const user = await ctx.runQuery(internal.user.getUserById, { id });

    if (!user || user.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found.",
      });
    }

    const validated = validateUserPasswordUpdateInput({ password });

    // Update or set password in auth system
    await ctx.runAction(internal.auth.setUserPassword, {
      email: user.email ?? "",
      password: validated.password,
      name: user.name,
    });
  },
});

export const deleteUser = mutation({
  args: {
    id: v.id("users"),
  },
  handler: async (ctx, { id }) => {
    const { user: currentUser } = await requireUser(ctx, { requireGod: true }) as { identity: any; user: any };

    const user = await ctx.db.get(id);

    if (!user || user.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found.",
      });
    }

    // Prevent deleting yourself
    if (user._id === currentUser._id) {
      throw new ConvexError({
        code: "CANNOT_DELETE_SELF",
        message: "You cannot delete your own account.",
      });
    }

    // Soft delete
    await ctx.db.patch(id, {
      deletedAt: Date.now(),
    });

    await logActivity({
      ctx,
      entityType: "user",
      action: "deleted",
      entityId: id,
      entityName: user.name || user.email || "User",
    });
  },
});

export const getUserInfo = query({
  args: {
    id: v.id("users"),
  },
  handler: async (ctx, { id }) => {
    await requireUser(ctx, { requireGod: true });

    const user = await ctx.db.get(id);

    if (!user || user.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found.",
      });
    }

    // Get subscription info (most recent)
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", id))
      .order("desc")
      .first();

    // All subscriptions for this user (history), newest first
    const allSubscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", id))
      .order("desc")
      .collect();

    const subscriptionHistory = allSubscriptions.map((sub) => ({
      subscriptionId: sub.subscriptionId,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      canceledAt: sub.canceledAt,
      createdAt: sub.createdAt,
      isAdminGranted: sub.subscriptionId.startsWith("admin-grant-"),
    }));

    // Checkout sessions (payment history)
    const checkoutSessions = await ctx.db
      .query("checkoutSessions")
      .withIndex("userId", (q) => q.eq("userId", id))
      .collect();

    const checkoutHistory = checkoutSessions
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((session) => ({
        sessionId: session.sessionId,
        status: session.status,
        createdAt: session.createdAt,
        completedAt: session.completedAt,
      }));

    const completedSessions = checkoutSessions.filter(
      (session) => session.status === "complete"
    );

    // Get payment settings to calculate total paid
    const paymentSettings = await ctx.db
      .query("paymentSettings")
      .order("desc")
      .first();

    // Calculate total paid (number of completed sessions * subscription price)
    let totalPaid = 0;
    if (paymentSettings && completedSessions.length > 0) {
      // Convert from cents to dollars/currency unit
      const pricePerPayment = paymentSettings.priceAmount / 100;
      totalPaid = completedSessions.length * pricePerPayment;
    }

    // Get all lesson progress for this user to find courses they've "touched"
    const allProgress = await ctx.db
      .query("lessonProgress")
      .withIndex("by_user_course_lesson", (q) => q.eq("user_id", id))
      .collect();

    // Get unique course IDs that user has activity in
    const courseIds = [...new Set(allProgress.map((p) => p.course_id))];

    // Get all courses user has activity in
    const courses = await Promise.all(
      courseIds.map((courseId) => ctx.db.get(courseId))
    );

    // Filter out null/undefined and deleted courses, and only include published courses
    const validCourses = courses.filter(
      (course) => course !== null && course.deletedAt === undefined && course.status === "published"
    ) as Array<Doc<"courses">>;

    // Build course data with progress information
    const coursesWithProgress = await Promise.all(
      validCourses.map(async (course) => {
        // Get all published lessons for this course
        const publishedLessons = await ctx.db
          .query("lessons")
          .withIndex("course_id", (q) =>
            q.eq("course_id", course._id).eq("deletedAt", undefined)
          )
          .filter((q) => q.eq(q.field("status"), "published"))
          .collect();

        // Get completed lessons for this course
        const courseProgress = allProgress.filter((p) => p.course_id === course._id);
        const completedLessonIds = new Set(courseProgress.map((p) => p.lesson_id));
        const completedCount = publishedLessons.filter((l) => completedLessonIds.has(l._id)).length;

        return {
          _id: course._id,
          name: course.name,
          name_ar: course.name_ar,
          slug: course.slug,
          category_id: course.category_id,
          lesson_count: course.lesson_count,
          createdAt: course.createdAt,
          completedLessons: completedCount,
          totalLessons: publishedLessons.length,
        };
      })
    );

    // Sort by most recently completed (if any progress exists)
    coursesWithProgress.sort((a, b) => {
      const aProgress = allProgress.filter((p) => p.course_id === a._id);
      const bProgress = allProgress.filter((p) => p.course_id === b._id);
      
      if (aProgress.length > 0 && bProgress.length > 0) {
        const aLastCompleted = Math.max(...aProgress.map((p) => p.completedAt));
        const bLastCompleted = Math.max(...bProgress.map((p) => p.completedAt));
        return bLastCompleted - aLastCompleted;
      }
      if (aProgress.length > 0) return -1;
      if (bProgress.length > 0) return 1;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isGod: user.isGod,
        emailVerificationTime: user.emailVerificationTime,
        createdAt: user._creationTime,
        stripeCustomerId: user.stripeCustomerId,
      },
      subscription: subscription
        ? {
            subscriptionId: subscription.subscriptionId,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            canceledAt: subscription.canceledAt,
            createdAt: subscription.createdAt,
            isAdminGranted: subscription.subscriptionId.startsWith("admin-grant-"),
          }
        : null,
      subscriptionHistory,
      checkoutHistory,
      paymentInfo: {
        totalPaid,
        currency: paymentSettings?.priceCurrency || "USD",
        completedPayments: completedSessions.length,
        paymentInterval: paymentSettings?.priceInterval || null,
      },
      courses: {
        total: coursesWithProgress.length,
        list: coursesWithProgress,
      },
    };
  },
});

/**
 * Admin-only: grant a subscription to a user who does not have an active one.
 * Creates an admin-granted subscription (no Stripe); duration in days.
 */
export const adminGrantSubscription = mutation({
  args: {
    userId: v.id("users"),
    durationDays: v.optional(v.number()),
  },
  returns: v.id("subscriptions"),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGod: true });

    const user = await ctx.db.get(args.userId);
    if (!user || user.deletedAt) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found.",
      });
    }

    const latest = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();

    const hasActiveSubscription =
      latest &&
      ACTIVE_SUBSCRIPTION_STATUSES.has(latest.status) &&
      latest.currentPeriodEnd >= Date.now();

    if (hasActiveSubscription) {
      throw new ConvexError({
        code: "ALREADY_HAS_SUBSCRIPTION",
        message: "User already has an active subscription.",
      });
    }

    const days = args.durationDays ?? 365;
    const nowMs = Date.now();
    const periodEndMs = nowMs + days * 86400 * 1000;
    const subscriptionId = `admin-grant-${args.userId}-${Date.now()}`;
    const customerId = `admin-grant-${args.userId}`;

    const id = await ctx.db.insert("subscriptions", {
      subscriptionId,
      userId: args.userId,
      customerId,
      status: "active",
      currentPeriodStart: nowMs,
      currentPeriodEnd: periodEndMs,
      cancelAtPeriodEnd: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await logActivity({
      ctx,
      entityType: "user",
      action: "updated",
      entityId: args.userId,
      entityName: user.name || user.email || "User",
    });

    return id;
  },
});

// Internal query to get all users for export
export const getAllUsersForExport = internalQuery({
  handler: async (ctx): Promise<Array<{ name: string; email: string; subscriptionStatus: string }>> => {
    const users = await ctx.db.query("users").collect();
    
    // Filter out deleted users and admins
    const normalUsers = users.filter((user) => user.deletedAt === undefined && !user.isGod);
    
    // Get subscription status for each user
    const usersWithSubscription = await Promise.all(
      normalUsers.map(async (user) => {
        // Get the most recent subscription for this user
        const subscription = await ctx.db
          .query("subscriptions")
          .withIndex("userId", (q) => q.eq("userId", user._id))
          .order("desc")
          .first();
        
        const subscriptionStatus = subscription?.status === "active" ? "Active" : "Not Active";
        
        return {
          name: user.name ?? "",
          email: user.email ?? "",
          subscriptionStatus,
        };
      })
    );
    
    // Only include users with email
    return usersWithSubscription.filter((user) => user.email);
  },
});

// Action to export user emails for email marketing
export const exportUserEmails = action({
  handler: async (ctx): Promise<string> => {
    // Check auth and admin status
    await requireUserAction(ctx);
    await ctx.runQuery(internal.user.requireAdminQuery);

    // Get all non-deleted users
    const users = await ctx.runQuery(internal.user.getAllUsersForExport);

    // Format as CSV
    const csvHeader = "Name,Email,Subscription Status\n";
    const csvRows = users
      .map((user) => {
        // Escape commas and quotes in CSV values
        const escapeCsv = (value: string | undefined) => {
          if (!value) return "";
          // If value contains comma, quote, or newline, wrap in quotes and escape quotes
          if (value.includes(",") || value.includes('"') || value.includes("\n")) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        };
        return `${escapeCsv(user.name)},${escapeCsv(user.email)},${escapeCsv(user.subscriptionStatus)}`;
      })
      .join("\n");

    return csvHeader + csvRows;
  },
});

