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
import type * as assistant_agent from "../assistant/agent.js";
import type * as assistant_auth from "../assistant/auth.js";
import type * as assistant_billing from "../assistant/billing.js";
import type * as assistant_chat from "../assistant/chat.js";
import type * as assistant_context from "../assistant/context.js";
import type * as assistant_courseSearchRelevance from "../assistant/courseSearchRelevance.js";
import type * as assistant_lib from "../assistant/lib.js";
import type * as assistant_memory from "../assistant/memory.js";
import type * as assistant_messages from "../assistant/messages.js";
import type * as assistant_prompt from "../assistant/prompt.js";
import type * as assistant_promptData from "../assistant/promptData.js";
import type * as assistant_promptRuntime from "../assistant/promptRuntime.js";
import type * as assistant_search from "../assistant/search.js";
import type * as assistant_settings from "../assistant/settings.js";
import type * as assistant_subscription from "../assistant/subscription.js";
import type * as assistant_threads from "../assistant/threads.js";
import type * as assistant_titles from "../assistant/titles.js";
import type * as assistant_validators from "../assistant/validators.js";
import type * as auth from "../auth.js";
import type * as blog from "../blog.js";
import type * as blogCategory from "../blogCategory.js";
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
import type * as lib_courseSearchText from "../lib/courseSearchText.js";
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
import type * as subscriptionsAdmin from "../subscriptionsAdmin.js";
import type * as subscriptionsAdminStripe from "../subscriptionsAdminStripe.js";
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
  "assistant/agent": typeof assistant_agent;
  "assistant/auth": typeof assistant_auth;
  "assistant/billing": typeof assistant_billing;
  "assistant/chat": typeof assistant_chat;
  "assistant/context": typeof assistant_context;
  "assistant/courseSearchRelevance": typeof assistant_courseSearchRelevance;
  "assistant/lib": typeof assistant_lib;
  "assistant/memory": typeof assistant_memory;
  "assistant/messages": typeof assistant_messages;
  "assistant/prompt": typeof assistant_prompt;
  "assistant/promptData": typeof assistant_promptData;
  "assistant/promptRuntime": typeof assistant_promptRuntime;
  "assistant/search": typeof assistant_search;
  "assistant/settings": typeof assistant_settings;
  "assistant/subscription": typeof assistant_subscription;
  "assistant/threads": typeof assistant_threads;
  "assistant/titles": typeof assistant_titles;
  "assistant/validators": typeof assistant_validators;
  auth: typeof auth;
  blog: typeof blog;
  blogCategory: typeof blogCategory;
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
  "lib/courseSearchText": typeof lib_courseSearchText;
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
  subscriptionsAdmin: typeof subscriptionsAdmin;
  subscriptionsAdminStripe: typeof subscriptionsAdminStripe;
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
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  actionRetrier: import("@convex-dev/action-retrier/_generated/component.js").ComponentApi<"actionRetrier">;
  aggregateCategories: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregateCategories">;
  aggregateLessonWatched: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregateLessonWatched">;
  aggregateCourseWatched: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregateCourseWatched">;
  aggregatePersonalTestAttemptStarts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregatePersonalTestAttemptStarts">;
  aggregatePersonalTestAttemptCompletions: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregatePersonalTestAttemptCompletions">;
  aggregatePersonalTestCourseRecommendations: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregatePersonalTestCourseRecommendations">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
};
