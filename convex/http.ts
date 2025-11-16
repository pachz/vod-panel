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

export default http;