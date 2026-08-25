import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./utils/auth";
import {
  getAuthenticatedUserOrThrow,
  personalTestPaywallPlanValidator,
  resolvePersonalTestAccess,
} from "./lib/personalTestAccess";

export const getPersonalTestAccessState = query({
  args: {
    now: v.number(),
  },
  returns: v.object({
    canAccess: v.boolean(),
    usesPackageModel: v.boolean(),
    paywallMode: v.union(
      v.literal("packages_subscribe"),
      v.literal("packages_upgrade"),
      v.null(),
    ),
    currentPlanId: v.union(v.id("subscriptionPlans"), v.null()),
    plans: v.array(personalTestPaywallPlanValidator),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const user = await getAuthenticatedUserOrThrow(ctx);
    return await resolvePersonalTestAccess(ctx, user, args.now);
  },
});
