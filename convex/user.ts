import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx, ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
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

    // Update password in auth system
    await ctx.runAction(internal.auth.setUserPassword, {
      email: currentUser.email,
      password: validated.password,
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

    // Update password in auth system
    await ctx.runAction(internal.auth.setUserPassword, {
      email: user.email ?? "",
      password: validated.password,
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

