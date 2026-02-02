import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run subscription expiry daily (marks active/trialing as canceled when period ended)
crons.daily(
  "expire-subscriptions",
  { hourUTC: 0, minuteUTC: 0 },
  internal.subscriptionCron.expireEndedSubscriptions,
  {},
);

export default crons;
