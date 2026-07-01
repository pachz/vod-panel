import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { MAX_TEST_ATTEMPT_LIFETIME_MS } from "../shared/validation/personalTest";
import {
  getExpiredAttemptDurationSeconds,
} from "./lib/personalTestScoring";

const BATCH_SIZE = 200;

/**
 * Marks in-progress test attempts as expired once they exceed the 6-hour limit.
 * Runs hourly via convex/crons.ts.
 */
export const expireStalePersonalTestAttempts = internalMutation({
  args: {},
  returns: v.object({ expiredCount: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const startedAtCutoff = now - MAX_TEST_ATTEMPT_LIFETIME_MS;

    const staleAttempts = await ctx.db
      .query("personalTestAttempts")
      .withIndex("by_status_startedAt", (q) =>
        q.eq("status", "in_progress").lte("startedAt", startedAtCutoff),
      )
      .take(BATCH_SIZE);

    for (const attempt of staleAttempts) {
      await ctx.db.patch(attempt._id, {
        status: "expired",
        completedAt: now,
        durationSeconds: getExpiredAttemptDurationSeconds(attempt.startedAt, now),
      });
    }

    return { expiredCount: staleAttempts.length };
  },
});
