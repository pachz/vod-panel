import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run subscription expiry daily at 00:00 UTC (admin-granted / non-Stripe only; Stripe `sub_*` uses Stripe sync)
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

// Full Mailchimp audience resync weekly (safety net alongside real-time sync)
crons.cron(
  "mailchimp-audience-resync",
  "0 3 * * 0",
  internal.mailchimp.processMailchimpBackfillPage,
  { cursor: null },
);

export default crons;
