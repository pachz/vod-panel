/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as category from "../category.js";
import type * as course from "../course.js";
import type * as http from "../http.js";
import type * as image from "../image.js";
import type * as lesson from "../lesson.js";
import type * as seed from "../seed.js";
import type * as user from "../user.js";
import type * as utils_auth from "../utils/auth.js";
import type * as utils_slug from "../utils/slug.js";
import type * as video from "../video.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  category: typeof category;
  course: typeof course;
  http: typeof http;
  image: typeof image;
  lesson: typeof lesson;
  seed: typeof seed;
  user: typeof user;
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

export declare const components: {};
