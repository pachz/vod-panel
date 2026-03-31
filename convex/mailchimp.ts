"use node";

import crypto from "node:crypto";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
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

/**
 * Mailchimp rejects POST /members/.../tags when setting status "inactive" for a tag
 * that was never on the contact. GET current tags first, then only send:
 * - "active" for every tag that should be on
 * - "inactive" only for managed tags that exist on the contact but should be removed
 */
async function applyMemberTags(
  config: { apiKey: string; server: string },
  memberTagsPath: string,
  desired: { name: string; status: "active" | "inactive" }[],
): Promise<{ ok: boolean; status: number; text: string; changeCount: number }> {
  const getRes = await mailchimpFetch(config, memberTagsPath, { method: "GET" });
  let currentNames = new Set<string>();

  if (getRes.ok) {
    const data = (await getRes.json()) as { tags?: { name: string }[] };
    currentNames = new Set((data.tags ?? []).map((t) => t.name));
    console.log("mailchimp: GET tags", {
      path: memberTagsPath,
      status: getRes.status,
      currentTagNames: [...currentNames],
    });
  } else if (getRes.status === 404) {
    currentNames = new Set();
    console.log("mailchimp: GET tags 404 (no tags yet)", { path: memberTagsPath });
  } else {
    const text = await getRes.text();
    console.error("mailchimp: GET tags failed", getRes.status, text);
    return { ok: false, status: getRes.status, text, changeCount: 0 };
  }

  const changes: { name: string; status: "active" | "inactive" }[] = [];
  for (const t of desired) {
    if (t.status === "active") {
      changes.push({ name: t.name, status: "active" });
    } else if (t.status === "inactive" && currentNames.has(t.name)) {
      changes.push({ name: t.name, status: "inactive" });
    }
  }

  console.log("mailchimp: tag changes to POST", {
    changeCount: changes.length,
    changes,
  });

  if (changes.length === 0) {
    console.log("mailchimp: no tag POST needed (desired state already matches or only inactive-for-absent)");
    return { ok: true, status: 200, text: "", changeCount: 0 };
  }

  const postRes = await mailchimpFetch(config, memberTagsPath, {
    method: "POST",
    body: JSON.stringify({ tags: changes }),
  });
  const text = await postRes.text();
  console.log("mailchimp: POST tags", {
    status: postRes.status,
    bodyPreview: text.slice(0, 500),
  });

  return {
    ok: postRes.ok,
    status: postRes.status,
    text,
    changeCount: changes.length,
  };
}

const mailchimpSyncResultValidator = v.object({
  ok: v.boolean(),
  skipped: v.boolean(),
  error: v.optional(v.string()),
  putStatus: v.optional(v.number()),
  tagsStatus: v.optional(v.number()),
  tagsDetail: v.optional(v.string()),
  tagChangesCount: v.optional(v.number()),
});

async function executeSyncUserToMailchimp(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<{
  ok: boolean;
  skipped: boolean;
  error?: string;
  putStatus?: number;
  tagsStatus?: number;
  tagsDetail?: string;
  tagChangesCount?: number;
}> {
    const config = getMailchimpConfig();
    if (!config) {
      return { ok: false, skipped: true, error: "Mailchimp not configured" };
    }

    const nowMs = Date.now();
    const payload = await ctx.runQuery(internal.mailchimpInternal.buildMailchimpSyncPayload, {
      userId,
      nowMs,
    });

    if (!payload) {
      return {
        ok: true,
        skipped: true,
        error: "User missing or has no email",
      };
    }

    const hash = md5SubscriberHash(payload.email);
    const listId = config.audienceId;
    const path = `/lists/${listId}/members/${hash}`;

    console.log("mailchimp: sync start", {
      userId,
      email: payload.email,
      isDeleted: payload.isDeleted,
      roleIsAdmin: payload.roleIsAdmin,
      hasPassword: payload.hasPassword,
      hasGoogle: payload.hasGoogle,
      hasSuccessfulPayment: payload.hasSuccessfulPayment,
      hasActiveSubscription: payload.hasActiveSubscription,
    });

    const tagsPath = `${path}/tags`;

    if (payload.isDeleted) {
      const putRes = await mailchimpFetch(config, path, {
        method: "PUT",
        body: JSON.stringify({
          email_address: payload.email,
          status: "unsubscribed",
        }),
      });
      const putText = await putRes.text();
      console.log("mailchimp: PUT member (unsubscribed)", { status: putRes.status, bodyPreview: putText.slice(0, 300) });
      if (!putRes.ok) {
        console.error("mailchimp: unsubscribe failed", putRes.status, putText);
        return {
          ok: false,
          skipped: false,
          error: putText.slice(0, 200),
          putStatus: putRes.status,
        };
      }

      const desiredAllInactive = MAILCHIMP_MANAGED_TAGS.map((name) => ({
        name,
        status: "inactive" as const,
      }));
      const tagResult = await applyMemberTags(config, tagsPath, desiredAllInactive);
      if (!tagResult.ok) {
        console.error("mailchimp: clear tags failed", tagResult.status, tagResult.text);
        return {
          ok: false,
          skipped: false,
          error: tagResult.text.slice(0, 200),
          putStatus: putRes.status,
          tagsStatus: tagResult.status,
          tagsDetail: tagResult.text.slice(0, 400),
          tagChangesCount: tagResult.changeCount,
        };
      }

      return {
        ok: true,
        skipped: false,
        putStatus: putRes.status,
        tagsStatus: tagResult.status,
        tagChangesCount: tagResult.changeCount,
      };
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
    const putText = await putRes.text();
    console.log("mailchimp: PUT member (subscribed)", { status: putRes.status, bodyPreview: putText.slice(0, 300) });

    if (!putRes.ok) {
      console.error("mailchimp: upsert member failed", putRes.status, putText);
      return {
        ok: false,
        skipped: false,
        error: putText.slice(0, 200),
        putStatus: putRes.status,
      };
    }

    const tagBodies = buildTagBodies({
      roleIsAdmin: payload.roleIsAdmin,
      hasPassword: payload.hasPassword,
      hasGoogle: payload.hasGoogle,
      hasSuccessfulPayment: payload.hasSuccessfulPayment,
      hasActiveSubscription: payload.hasActiveSubscription,
    });

    const tagResult = await applyMemberTags(config, tagsPath, tagBodies);
    if (!tagResult.ok) {
      console.error("mailchimp: update tags failed", tagResult.status, tagResult.text);
      return {
        ok: false,
        skipped: false,
        error: tagResult.text.slice(0, 200),
        putStatus: putRes.status,
        tagsStatus: tagResult.status,
        tagsDetail: tagResult.text.slice(0, 400),
        tagChangesCount: tagResult.changeCount,
      };
    }

    return {
      ok: true,
      skipped: false,
      putStatus: putRes.status,
      tagsStatus: tagResult.status,
      tagChangesCount: tagResult.changeCount,
    };
}

export const syncUserToMailchimp = internalAction({
  args: {
    userId: v.id("users"),
  },
  returns: mailchimpSyncResultValidator,
  handler: async (ctx, args) => executeSyncUserToMailchimp(ctx, args.userId),
});

/** Admin-only: run Mailchimp sync for one user (e.g. testing). */
export const runMailchimpSyncForUser = action({
  args: {
    userId: v.id("users"),
  },
  returns: mailchimpSyncResultValidator,
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.user.requireAdminQuery);
    return await executeSyncUserToMailchimp(ctx, args.userId);
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
