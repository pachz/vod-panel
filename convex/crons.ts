import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run subscription expiry daily at 00:00 UTC (marks active/trialing as canceled when period ended)
crons.cron(
  "expire-subscriptions",
  "0 0 * * *",
  internal.subscriptionCron.expireEndedSubscriptions,
  {},
);

// Sync subscription statuses from Stripe daily at 01:00 UTC
crons.cron(
  "sync-subscriptions-with-stripe",
  "0 1 * * *",
  internal.payment.syncAllSubscriptionsFromStripe,
  {},
);

export default crons;
