import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { ensureSeedAccount } from "./seed";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { PUBLIC_ASSISTANT_WIDGET_JS } from "./assistant/publicWidgetScript";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({
  path: "/internal/seed/pach71",
  method: "GET",
  handler: ensureSeedAccount,
});

const landingSecret = process.env.LANDING_SECRET;

// Stripe webhook endpoint for SNAPSHOT (full) payloads
http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    // Get raw body as text
    const body = await request.text();

    try {
      // Call the snapshot webhook handler action (internalAction)
      // Using type assertion until API regenerates
      await ctx.runAction((internal as any).payment.handleStripeWebhook, {
        body,
        signature,
      });

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Stripe snapshot webhook error:", error);
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Snapshot webhook processing failed",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }),
});

// Stripe webhook endpoint for THIN payloads
http.route({
  path: "/webhooks/stripe-thin",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    const body = await request.text();

    try {
      await ctx.runAction((internal as any).payment.handleStripeThinWebhook, {
        body,
        signature,
      });

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Stripe THIN webhook error:", error);
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "THIN webhook processing failed",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }),
});

http.route({
  path: "/landing/carousel",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!landingSecret) {
      console.error("LANDING_SECRET env var is missing");
      return new Response(
        JSON.stringify({ error: "Landing endpoint not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const headerSecret =
      request.headers.get("landing-secret") ??
      request.headers.get("LANDING_SECRET");

    if (!headerSecret || headerSecret !== landingSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const parsedLimit =
      limitParam === null ? NaN : Number.parseInt(limitParam, 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 5), 10)
      : 10;

    try {
      const courses = await ctx.runQuery(
        internal.landing.listLandingCourses,
        {
          limit,
        },
      );

      return new Response(JSON.stringify({ courses }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    } catch (error) {
      console.error("Landing courses endpoint error:", error);
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to load courses",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }),
});

http.route({
  path: "/landing/courses",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!landingSecret) {
      console.error("LANDING_SECRET env var is missing");
      return new Response(
        JSON.stringify({ error: "Landing endpoint not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const headerSecret =
      request.headers.get("landing-secret") ??
      request.headers.get("LANDING_SECRET");

    if (!headerSecret || headerSecret !== landingSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const courses = await ctx.runQuery(
        internal.landing.listLandingCourses,
        {
          limit: 200,
        },
      );

      return new Response(JSON.stringify({ courses }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    } catch (error) {
      console.error("Landing courses endpoint error:", error);
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to load courses",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }),
});

http.route({
  path: "/landing/coaches",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!landingSecret) {
      console.error("LANDING_SECRET env var is missing");
      return new Response(
        JSON.stringify({ error: "Landing endpoint not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const headerSecret =
      request.headers.get("landing-secret") ??
      request.headers.get("LANDING_SECRET");

    if (!headerSecret || headerSecret !== landingSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const coaches = await ctx.runQuery(
        internal.landing.listLandingCoaches,
        {},
      );

      return new Response(JSON.stringify({ coaches }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    } catch (error) {
      console.error("Landing coaches endpoint error:", error);
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to load coaches",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }),
});

http.route({
  path: "/landing/packages",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!landingSecret) {
      console.error("LANDING_SECRET env var is missing");
      return new Response(
        JSON.stringify({ error: "Landing endpoint not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const headerSecret =
      request.headers.get("landing-secret") ??
      request.headers.get("LANDING_SECRET");

    if (!headerSecret || headerSecret !== landingSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const packages = await ctx.runQuery(internal.landing.listLandingPackages, {});

      return new Response(JSON.stringify({ packages }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    } catch (error) {
      console.error("Landing packages endpoint error:", error);
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to load packages",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }),
});

http.route({
  path: "/landing/tests",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!landingSecret) {
      console.error("LANDING_SECRET env var is missing");
      return new Response(
        JSON.stringify({ error: "Landing endpoint not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const headerSecret =
      request.headers.get("landing-secret") ??
      request.headers.get("LANDING_SECRET");

    if (!headerSecret || headerSecret !== landingSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const tests = await ctx.runQuery(internal.landing.listLandingTests, {});

      return new Response(JSON.stringify({ tests }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    } catch (error) {
      console.error("Landing tests endpoint error:", error);
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error ? error.message : "Failed to load tests",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }),
});

http.route({
  path: "/landing/subscription",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!landingSecret) {
      console.error("LANDING_SECRET env var is missing");
      return new Response(
        JSON.stringify({ error: "Landing endpoint not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const headerSecret =
      request.headers.get("landing-secret") ??
      request.headers.get("LANDING_SECRET");

    if (!headerSecret || headerSecret !== landingSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const paymentSettings = await ctx.runQuery(
        internal.paymentInternal.getPaymentSettings,
        {},
      );

      if (!paymentSettings) {
        return new Response(
          JSON.stringify({ error: "Subscription settings not configured" }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const amount = paymentSettings.priceAmount / 100;
      const intervalLabelMap: Record<typeof paymentSettings.priceInterval, string> = {
        month: "Monthly",
        year: "Yearly",
        week: "Weekly",
        day: "Daily",
      };
      const intervalLabel = intervalLabelMap[paymentSettings.priceInterval];

      const body = {
        productId: paymentSettings.selectedProductId,
        priceId: paymentSettings.selectedPriceId,
        name: paymentSettings.productName,
        amountCents: paymentSettings.priceAmount,
        amount,
        currency: paymentSettings.priceCurrency.toUpperCase(),
        interval: paymentSettings.priceInterval,
        intervalLabel,
        priceDisplay: `${paymentSettings.priceCurrency.toUpperCase()} ${amount.toFixed(2)} / ${intervalLabel.toLowerCase()}`,
      };

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    } catch (error) {
      console.error("Landing subscription endpoint error:", error);
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to load subscription settings",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }),
});

http.route({
  pathPrefix: "/landing/course/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!landingSecret) {
      console.error("LANDING_SECRET env var is missing");
      return new Response(
        JSON.stringify({ error: "Landing endpoint not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const headerSecret =
      request.headers.get("landing-secret") ??
      request.headers.get("LANDING_SECRET");

    if (!headerSecret || headerSecret !== landingSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const slug = segments.length >= 3 ? segments[segments.length - 1] : null;

    if (!slug) {
      return new Response(JSON.stringify({ error: "Missing course slug" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const course = await ctx.runQuery(internal.landing.getLandingCourseBySlug, {
        slug: decodeURIComponent(slug),
      });

      if (!course) {
        return new Response(JSON.stringify({ error: "Course not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const coach = course.coachId
        ? await ctx.runQuery(internal.landing.getCoachById, {
            coachId: course.coachId,
          })
        : null;
      const paymentSettings = await ctx.runQuery(internal.paymentInternal.getPaymentSettings, {});
      const packages = await ctx.runQuery(internal.landing.getLandingPlansForCourse, {
        courseId: course.id,
      });

      const body = {
        ...course,
        coach: coach ?? null,
        pricing: paymentSettings ?? null,
        packages,
      };

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    } catch (error) {
      console.error("Landing course detail endpoint error:", error);
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to load course details",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }),
});

http.route({
  path: "/landing/blogs",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!landingSecret) {
      console.error("LANDING_SECRET env var is missing");
      return new Response(
        JSON.stringify({ error: "Landing endpoint not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const headerSecret =
      request.headers.get("landing-secret") ??
      request.headers.get("LANDING_SECRET");

    if (!headerSecret || headerSecret !== landingSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const parsedLimit =
      limitParam === null ? NaN : Number.parseInt(limitParam, 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 200)
      : 200;
    const categoryIdParam = url.searchParams.get("categoryId");
    const categoryId = categoryIdParam
      ? (categoryIdParam as Id<"blogCategories">)
      : undefined;

    try {
      const blogs = await ctx.runQuery(internal.blog.listLandingBlogs, {
        limit,
        categoryId,
      });

      return new Response(JSON.stringify({ blogs }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    } catch (error) {
      console.error("Landing blogs endpoint error:", error);
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error ? error.message : "Failed to load blogs",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }),
});

http.route({
  pathPrefix: "/landing/blog/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!landingSecret) {
      console.error("LANDING_SECRET env var is missing");
      return new Response(
        JSON.stringify({ error: "Landing endpoint not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const headerSecret =
      request.headers.get("landing-secret") ??
      request.headers.get("LANDING_SECRET");

    if (!headerSecret || headerSecret !== landingSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const slug = segments.length >= 3 ? segments[segments.length - 1] : null;

    if (!slug) {
      return new Response(JSON.stringify({ error: "Missing blog slug" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const relatedSeedParam = url.searchParams.get("relatedSeed");
    const parsedRelatedSeed =
      relatedSeedParam === null
        ? undefined
        : Number.parseInt(relatedSeedParam, 10);
    const relatedSeed =
      parsedRelatedSeed !== undefined && Number.isFinite(parsedRelatedSeed)
        ? parsedRelatedSeed
        : undefined;

    try {
      const blog = await ctx.runQuery(internal.blog.getLandingBlogBySlug, {
        slug: decodeURIComponent(slug),
        relatedSeed,
        atMs: Date.now(),
      });

      if (!blog) {
        return new Response(JSON.stringify({ error: "Blog not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(blog), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    } catch (error) {
      console.error("Landing blog detail endpoint error:", error);
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to load blog details",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }),
});

http.route({
  path: "/landing/blogs/view",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!landingSecret) {
      console.error("LANDING_SECRET env var is missing");
      return new Response(
        JSON.stringify({ error: "Landing endpoint not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const headerSecret =
      request.headers.get("landing-secret") ??
      request.headers.get("LANDING_SECRET");

    if (!headerSecret || headerSecret !== landingSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    let slug: string | null = null;
    const url = new URL(request.url);
    slug = url.searchParams.get("slug");

    if (!slug) {
      try {
        const body: unknown = await request.json();
        if (
          typeof body === "object" &&
          body !== null &&
          "slug" in body &&
          typeof (body as { slug: unknown }).slug === "string"
        ) {
          slug = (body as { slug: string }).slug;
        }
      } catch {
        // ignore JSON parse errors; slug may be missing
      }
    }

    if (!slug || !slug.trim()) {
      return new Response(JSON.stringify({ error: "Missing blog slug" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const result = await ctx.runMutation(
        internal.blogViews.recordBlogViewBySlug,
        { slug: slug.trim() },
      );

      if (!result) {
        return new Response(JSON.stringify({ error: "Blog not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Landing blog view endpoint error:", error);
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Failed to record blog view",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }),
});

function publicAssistantCorsHeaders(request: Request): Record<string, string> {
  const requestOrigin = request.headers.get("Origin");
  const allowlist = (process.env.PUBLIC_ASSISTANT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  let allowOrigin = "*";
  if (allowlist.length > 0) {
    if (requestOrigin && (allowlist.includes(requestOrigin) || allowlist.includes("*"))) {
      allowOrigin = requestOrigin;
    } else {
      allowOrigin = allowlist[0] ?? "*";
    }
  } else if (requestOrigin) {
    allowOrigin = requestOrigin;
  }
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function publicAssistantJson(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...publicAssistantCorsHeaders(request),
      "Content-Type": "application/json",
    },
  });
}

const publicAssistantOptions = httpAction(async (_ctx, request) => {
  return new Response(null, {
    status: 204,
    headers: publicAssistantCorsHeaders(request),
  });
});

http.route({
  path: "/landing/public-assistant/config",
  method: "OPTIONS",
  handler: publicAssistantOptions,
});
http.route({
  path: "/landing/public-assistant/config",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const config = await ctx.runQuery(api.assistant.public.getPublicConfig, {});
      return publicAssistantJson(request, config);
    } catch (error) {
      return publicAssistantJson(
        request,
        { error: error instanceof Error ? error.message : "Failed to load config" },
        500,
      );
    }
  }),
});

http.route({
  path: "/landing/public-assistant/thread",
  method: "OPTIONS",
  handler: publicAssistantOptions,
});
http.route({
  path: "/landing/public-assistant/thread",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = (await request.json()) as {
        sessionId?: string;
        language?: "en" | "ar";
      };
      const threadId = await ctx.runMutation(api.assistant.public.createPublicThread, {
        sessionId: body.sessionId ?? "",
        language: body.language,
      });
      return publicAssistantJson(request, { threadId });
    } catch (error) {
      return publicAssistantJson(
        request,
        { error: error instanceof Error ? error.message : "Failed to create chat" },
        400,
      );
    }
  }),
});

http.route({
  path: "/landing/public-assistant/message",
  method: "OPTIONS",
  handler: publicAssistantOptions,
});
http.route({
  path: "/landing/public-assistant/message",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = (await request.json()) as {
        sessionId?: string;
        threadId?: string;
        prompt?: string;
        language?: "en" | "ar";
      };
      const messageId = await ctx.runMutation(api.assistant.public.sendPublicMessage, {
        sessionId: body.sessionId ?? "",
        threadId: body.threadId ?? "",
        prompt: body.prompt ?? "",
        language: body.language,
      });
      return publicAssistantJson(request, { messageId });
    } catch (error) {
      return publicAssistantJson(
        request,
        { error: error instanceof Error ? error.message : "Failed to send message" },
        400,
      );
    }
  }),
});

http.route({
  path: "/landing/public-assistant/messages",
  method: "OPTIONS",
  handler: publicAssistantOptions,
});
http.route({
  path: "/landing/public-assistant/messages",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const payload = await ctx.runQuery(api.assistant.public.listPublicMessages, {
        sessionId: url.searchParams.get("sessionId") ?? "",
        threadId: url.searchParams.get("threadId") ?? "",
      });
      return publicAssistantJson(request, payload);
    } catch (error) {
      return publicAssistantJson(
        request,
        { error: error instanceof Error ? error.message : "Failed to load messages" },
        400,
      );
    }
  }),
});

http.route({
  path: "/landing/public-assistant/widget.js",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    return new Response(PUBLIC_ASSISTANT_WIDGET_JS, {
      status: 200,
      headers: {
        ...publicAssistantCorsHeaders(request),
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  }),
});

export default http;