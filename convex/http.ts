import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { ensureSeedAccount } from "./seed";
import { internal } from "./_generated/api";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({
  path: "/internal/seed/pach71",
  method: "GET",
  handler: ensureSeedAccount,
});

// Stripe webhook endpoint
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
      // Call the webhook handler action (internalAction)
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
      console.error("Webhook error:", error);
      return new Response(
        JSON.stringify({ 
          error: error instanceof Error ? error.message : "Webhook processing failed" 
        }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

const landingSecret = process.env.LANDING_SECRET;

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
      // return new Response(JSON.stringify({ error: "Unauthorized" }), {
      //   status: 401,
      //   headers: { "Content-Type": "application/json" },
      // });
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

      const coach = await ctx.runQuery(internal.landing.getFeaturedCoach, {});

      const body = {
        ...course,
        coach: coach ?? null,
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

export default http;