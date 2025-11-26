import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { convexAuth, createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { internalAction } from "./_generated/server";
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
  callbacks: {},
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
  },
  handler: async (ctx, args) => {
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: {
        id: args.email,
        secret: args.password,
      },
    });
    return true;
  },
});
