import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

type UserDoc = Doc<"users">;

type RequireUserOptions = {
  requireGod?: boolean;
};

type RequireUserResult<T extends boolean = false> = T extends true
  ? { identity: any; user: UserDoc }
  : { identity: any };

/**
 * Require that a user is authenticated (for queries and mutations)
 * @param ctx - Query or Mutation context
 * @param options - Options for requiring user
 * @param options.requireGod - If true, also requires the user to be an admin (isGod flag)
 * @returns Object containing identity and optionally user document
 */
export const requireUser = async <T extends boolean = false>(
  ctx: QueryCtx | MutationCtx,
  options?: RequireUserOptions
): Promise<RequireUserResult<T>> => {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "You must be signed in to continue.",
    });
  }

  // If we don't need to check for admin, just return identity
  if (!options?.requireGod) {
    return { identity } as RequireUserResult<T>;
  }

  // Get user ID from auth
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "User ID not found. Please sign out and sign in again.",
    });
  }

  // Get user from users table
  const user = await ctx.db.get(userId as Id<"users">);

  if (!user) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Your account is not set up. Please contact support.",
    });
  }

  if (user.deletedAt) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Your account has been deactivated. Please contact support.",
    });
  }

  // Check if user is admin (isGod flag)
  if (!user.isGod) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "You must be an administrator to access this resource.",
    });
  }

  return { identity, user } as RequireUserResult<T>;
};

/**
 * Require that a user is authenticated (for actions)
 * Actions cannot directly access the database, so this function only checks authentication
 * For admin checks in actions, use requireAdminQuery via ctx.runQuery
 * @param ctx - Action context
 * @returns Object containing identity
 */
export const requireUserAction = async (
  ctx: ActionCtx
): Promise<{ identity: any }> => {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "You must be signed in to continue.",
    });
  }

  return { identity };
};

