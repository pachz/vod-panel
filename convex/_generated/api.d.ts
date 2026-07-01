/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ResendOTPPasswordReset from "../ResendOTPPasswordReset.js";
import type * as activityLog from "../activityLog.js";
import type * as auth from "../auth.js";
import type * as category from "../category.js";
import type * as chapter from "../chapter.js";
import type * as coach from "../coach.js";
import type * as course from "../course.js";
import type * as courseAccess from "../courseAccess.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as http from "../http.js";
import type * as image from "../image.js";
import type * as landing from "../landing.js";
import type * as legacySubscriptionMigration from "../legacySubscriptionMigration.js";
import type * as legacySubscriptionMigrationStripe from "../legacySubscriptionMigrationStripe.js";
import type * as lesson from "../lesson.js";
import type * as lessonProgress from "../lessonProgress.js";
import type * as lib_personalTestAttemptAggregates from "../lib/personalTestAttemptAggregates.js";
import type * as lib_personalTestScoring from "../lib/personalTestScoring.js";
import type * as lib_personalTestSubmissions from "../lib/personalTestSubmissions.js";
import type * as mailchimp from "../mailchimp.js";
import type * as mailchimpInternal from "../mailchimpInternal.js";
import type * as migrations from "../migrations.js";
import type * as payment from "../payment.js";
import type * as paymentInternal from "../paymentInternal.js";
import type * as personalTest from "../personalTest.js";
import type * as personalTestAttemptAnalytics from "../personalTestAttemptAnalytics.js";
import type * as personalTestAttempts from "../personalTestAttempts.js";
import type * as personalTestAttemptsCron from "../personalTestAttemptsCron.js";
import type * as plans from "../plans.js";
import type * as plansInternal from "../plansInternal.js";
import type * as plansStripe from "../plansStripe.js";
import type * as refetchLessonDurations from "../refetchLessonDurations.js";
import type * as seed from "../seed.js";
import type * as subscriptionCron from "../subscriptionCron.js";
import type * as user from "../user.js";
import type * as utils_activityLog from "../utils/activityLog.js";
import type * as utils_auth from "../utils/auth.js";
import type * as utils_slug from "../utils/slug.js";
import type * as video from "../video.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTPPasswordReset: typeof ResendOTPPasswordReset;
  activityLog: typeof activityLog;
  auth: typeof auth;
  category: typeof category;
  chapter: typeof chapter;
  coach: typeof coach;
  course: typeof course;
  courseAccess: typeof courseAccess;
  crons: typeof crons;
  dashboard: typeof dashboard;
  http: typeof http;
  image: typeof image;
  landing: typeof landing;
  legacySubscriptionMigration: typeof legacySubscriptionMigration;
  legacySubscriptionMigrationStripe: typeof legacySubscriptionMigrationStripe;
  lesson: typeof lesson;
  lessonProgress: typeof lessonProgress;
  "lib/personalTestAttemptAggregates": typeof lib_personalTestAttemptAggregates;
  "lib/personalTestScoring": typeof lib_personalTestScoring;
  "lib/personalTestSubmissions": typeof lib_personalTestSubmissions;
  mailchimp: typeof mailchimp;
  mailchimpInternal: typeof mailchimpInternal;
  migrations: typeof migrations;
  payment: typeof payment;
  paymentInternal: typeof paymentInternal;
  personalTest: typeof personalTest;
  personalTestAttemptAnalytics: typeof personalTestAttemptAnalytics;
  personalTestAttempts: typeof personalTestAttempts;
  personalTestAttemptsCron: typeof personalTestAttemptsCron;
  plans: typeof plans;
  plansInternal: typeof plansInternal;
  plansStripe: typeof plansStripe;
  refetchLessonDurations: typeof refetchLessonDurations;
  seed: typeof seed;
  subscriptionCron: typeof subscriptionCron;
  user: typeof user;
  "utils/activityLog": typeof utils_activityLog;
  "utils/auth": typeof utils_auth;
  "utils/slug": typeof utils_slug;
  video: typeof video;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  actionRetrier: import("@convex-dev/action-retrier/_generated/component.js").ComponentApi<"actionRetrier">;
  aggregateCategories: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregateCategories">;
  aggregateLessonWatched: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregateLessonWatched">;
  aggregateCourseWatched: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregateCourseWatched">;
  aggregatePersonalTestAttemptStarts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregatePersonalTestAttemptStarts">;
  aggregatePersonalTestAttemptCompletions: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregatePersonalTestAttemptCompletions">;
  aggregatePersonalTestCourseRecommendations: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregatePersonalTestCourseRecommendations">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
};
