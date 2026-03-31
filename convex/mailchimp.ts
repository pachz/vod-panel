"use node";

import crypto from "node:crypto";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { MAILCHIMP_MANAGED_TAGS } from "./mailchimpInternal";

function md5SubscriberHash(email: string): string {
  return crypto.createHash("md5").update(email.toLowerCase().trim()).digest("hex");
}

function getMailchimpServerFromApiKey(apiKey: string): string {
  const parts = apiKey.split("-");
  return parts.length >= 2 ? (parts[parts.length - 1] ?? "") : "";
}

function getMailchimpConfig(): { apiKey: string; server: string; audienceId: string } | null {
  const apiKey = process.env.MAILCHIMP_API_KEY?.trim();
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID?.trim();
  if (!apiKey || !audienceId) {
    return null;
  }
  const server = process.env.MAILCHIMP_SERVER_PREFIX?.trim() || getMailchimpServerFromApiKey(apiKey);
  if (!server) {
    console.warn("mailchimp: could not determine server prefix from API key");
    return null;
  }
  return { apiKey, server, audienceId };
}

async function mailchimpFetch(
  config: { apiKey: string; server: string },
  path: string,
  init: RequestInit,
): Promise<Response> {
  const url = `https://${config.server}.api.mailchimp.com/3.0${path}`;
  const auth = Buffer.from(`anystring:${config.apiKey}`).toString("base64");
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

function buildTagBodies(payload: {
  roleIsAdmin: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
  hasSuccessfulPayment: boolean;
  hasActiveSubscription: boolean;
}): { name: string; status: "active" | "inactive" }[] {
  return MAILCHIMP_MANAGED_TAGS.map((name) => {
    let active = false;
    if (name === "role-admin") {
      active = payload.roleIsAdmin;
    } else if (name === "role-user") {
      active = !payload.roleIsAdmin;
    } else if (name === "signup-password") {
      active = payload.hasPassword;
    } else if (name === "signup-google") {
      active = payload.hasGoogle;
    } else if (name === "payment-success") {
      active = payload.hasSuccessfulPayment;
    } else if (name === "subscription-active") {
      active = payload.hasActiveSubscription;
    }
    return { name, status: active ? ("active" as const) : ("inactive" as const) };
  });
}

export const syncUserToMailchimp = internalAction({
  args: {
    userId: v.id("users"),
  },
  returns: v.object({
    ok: v.boolean(),
    skipped: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const config = getMailchimpConfig();
    if (!config) {
      return { ok: false, skipped: true, error: "Mailchimp not configured" };
    }

    const nowMs = Date.now();
    const payload = await ctx.runQuery(internal.mailchimpInternal.buildMailchimpSyncPayload, {
      userId: args.userId,
      nowMs,
    });

    if (!payload) {
      return { ok: true, skipped: true };
    }

    const hash = md5SubscriberHash(payload.email);
    const listId = config.audienceId;
    const path = `/lists/${listId}/members/${hash}`;

    if (payload.isDeleted) {
      const putRes = await mailchimpFetch(config, path, {
        method: "PUT",
        body: JSON.stringify({
          email_address: payload.email,
          status: "unsubscribed",
        }),
      });
      if (!putRes.ok) {
        const text = await putRes.text();
        console.error("mailchimp: unsubscribe failed", putRes.status, text);
        return { ok: false, skipped: false, error: text.slice(0, 200) };
      }

      const tagsRes = await mailchimpFetch(config, `${path}/tags`, {
        method: "POST",
        body: JSON.stringify({
          tags: MAILCHIMP_MANAGED_TAGS.map((name) => ({
            name,
            status: "inactive",
          })),
        }),
      });
      if (!tagsRes.ok) {
        const text = await tagsRes.text();
        console.error("mailchimp: clear tags failed", tagsRes.status, text);
        return { ok: false, skipped: false, error: text.slice(0, 200) };
      }

      return { ok: true, skipped: false };
    }

    const putBody = {
      email_address: payload.email,
      status_if_new: "subscribed",
      status: "subscribed",
      merge_fields: {
        FNAME: payload.firstName || payload.email.split("@")[0] || "Member",
      },
    };

    const putRes = await mailchimpFetch(config, path, {
      method: "PUT",
      body: JSON.stringify(putBody),
    });

    if (!putRes.ok) {
      const text = await putRes.text();
      console.error("mailchimp: upsert member failed", putRes.status, text);
      return { ok: false, skipped: false, error: text.slice(0, 200) };
    }

    const tagBodies = buildTagBodies({
      roleIsAdmin: payload.roleIsAdmin,
      hasPassword: payload.hasPassword,
      hasGoogle: payload.hasGoogle,
      hasSuccessfulPayment: payload.hasSuccessfulPayment,
      hasActiveSubscription: payload.hasActiveSubscription,
    });

    const tagsRes = await mailchimpFetch(config, `${path}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags: tagBodies }),
    });

    if (!tagsRes.ok) {
      const text = await tagsRes.text();
      console.error("mailchimp: update tags failed", tagsRes.status, text);
      return { ok: false, skipped: false, error: text.slice(0, 200) };
    }

    return { ok: true, skipped: false };
  },
});

const BACKFILL_PAGE_SIZE = 40;

export const processMailchimpBackfillPage = internalAction({
  args: {
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = getMailchimpConfig();
    if (!config) {
      console.warn("mailchimp backfill: skipped (not configured)");
      return null;
    }

    const page = await ctx.runQuery(internal.mailchimpInternal.listUsersPageForMailchimp, {
      paginationOpts: { numItems: BACKFILL_PAGE_SIZE, cursor: args.cursor },
    });

    for (const row of page.page) {
      await ctx.runAction(internal.mailchimp.syncUserToMailchimp, { userId: row._id });
    }

    if (!page.isDone && page.continueCursor !== null) {
      await ctx.scheduler.runAfter(0, internal.mailchimp.processMailchimpBackfillPage, {
        cursor: page.continueCursor,
      });
    }

    return null;
  },
});
