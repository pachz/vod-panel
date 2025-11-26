import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({})],
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
