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

      const body = {
        ...course,
        coach: coach ?? null,
        pricing: paymentSettings ?? null,
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