import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { convexAuth, createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { internalAction, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({
    reset: ResendOTPPasswordReset,
    validatePasswordRequirements: (password: string) => {
      if (
        !password ||
        password.length < 8 ||
        !/\d/.test(password) ||
        !/[a-z]/.test(password) ||
        !/[A-Z]/.test(password)
      ) {
        throw new ConvexError(
          "Password must be at least 8 characters long, must contain an uppercase letter, a lowercase letter, and a number"
        );
      }
    },
  }), Google],
  callbacks: {
    afterUserCreatedOrUpdated: async (ctx, args) => {
      const user = await ctx.db.get(args.userId as Id<"users">);

      if (user?.deletedAt) {
        throw new ConvexError({
          code: "UNAUTHORIZED",
          message: "This account has been deactivated. Please contact support.",
        });
      }

      // Keep searchable name+email field in sync (auth creates/updates users without it)
      if (user) {
        const name = (user.name ?? "").trim();
        const email = (user.email ?? "").trim();
        const name_search = [name, email].filter(Boolean).join(" ").trim() || undefined;
        if (name_search !== user.name_search) {
          await ctx.db.patch(args.userId as Id<"users">, { name_search });
        }
      }
    },
    // async createOrUpdateUser(ctx: MutationCtx, args) {
    //   // Helper function to update user image
    //   const updateUserImage = async (userId: Id<"users">) => {
    //     if (args.type === "oauth" && args.profile.image) {
    //       await ctx.db.patch(userId, {
    //         image: args.profile.image as string
    //       });
    //     }
    //     return userId;
    //   };

    //   if (args.existingUserId) {
    //     return updateUserImage(args.existingUserId);
    //   }

    //   // Implement your own account linking logic:
    //   const existingUser = await ctx.runMutation(api.vendors.auth.findUserByEmail, { 
    //     email: args.profile.email as string
    //   })
    //   if (existingUser) {
    //     return updateUserImage(existingUser._id);
    //   }

    //   //if google login, then throw on signup
    //   if (args.type === "oauth" && args.provider.id === "google") {
    //     throw new ConvexError("Google signup is not allowed");
    //   }

    //   // Implement your own user creation:
    //   return ctx.db.insert("users", {
    //     name: args.profile.name as string,
    //     email: args.profile.email as string,
    //     image: args.profile.image as string,
    //   });
    // },
  },
});

export const createAuthAccount = internalAction({
  args: {
    email: v.string(),
    name: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const { email, name, password } = args;

    // Try to create the account
    try {
      await createAccount(ctx, {
        provider: "password",
        account: {
          id: email,
          secret: password,
        },
        profile: {
          name,
          email,
        } as any,
        shouldLinkViaEmail: true,
      });
      
      // Account was created successfully, credentials are already set
      return {
        created: true,
        passwordUpdated: true,
      };
    } catch (error) {
      // If account already exists, try to update the credentials
      if (error instanceof Error && error.message.includes("already exists")) {
        // Try to update credentials, but don't fail if it doesn't work
        // (the account exists, so we can still create the user record)
        try {
          await modifyAccountCredentials(ctx, {
            provider: "password",
            account: {
              id: email,
              secret: password,
            },
          });
          return {
            created: false,
            passwordUpdated: true,
          };
        } catch (updateError) {
          // If updating credentials fails, that's okay - account exists
          // We'll still allow user record creation
          return {
            created: false,
            passwordUpdated: false,
          };
        }
      }
      // For any other error, re-throw it
      throw error;
    }
  },
});

export const setUserPassword = internalAction({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: {
          id: args.email,
          secret: args.password,
        },
      });
      return true;
    } catch (error) {
      // User may have signed in with Google only — no password account exists.
      // Create and link a password account for them (set password).
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("does not exist")) {
        throw error;
      }
      await createAccount(ctx, {
        provider: "password",
        account: {
          id: args.email,
          secret: args.password,
        },
        profile: {
          email: args.email,
          ...(args.name !== undefined && { name: args.name }),
        } as { email: string; name?: string },
        shouldLinkViaEmail: true,
      });
      return true;
    }
  },
});
