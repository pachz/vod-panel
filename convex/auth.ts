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

    let created = false;

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
      created = true;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("already exists")) {
        throw error;
      }
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: {
        id: email,
        secret: password,
      },
    });

    return {
      created,
      passwordUpdated: true,
    };
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
