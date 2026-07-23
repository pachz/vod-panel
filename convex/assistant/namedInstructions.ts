import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireUser } from "../utils/auth";
import { namedInstructionResultValidator } from "./validators";
import { ASSISTANT_TOOL_CATALOG } from "./toolsCatalog";

const MAX_NAME_LENGTH = 80;
const MAX_TITLE_LENGTH = 120;
const MAX_WHEN_TO_USE_LENGTH = 500;
const MAX_BODY_LENGTH = 20_000;
const MAX_LIST = 100;

const namedInstructionAdminValidator = v.object({
  _id: v.id("assistantNamedInstructions"),
  name: v.string(),
  title: v.string(),
  body: v.string(),
  whenToUse: v.string(),
  enabled: v.boolean(),
  sortOrder: v.number(),
  updatedAt: v.number(),
});

export type NamedInstructionsToolContext = {
  instructions: Array<{
    name: string;
    title: string;
    whenToUse: string;
  }>;
};

function normalizeName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

function validateInstructionFields(args: {
  name: string;
  title: string;
  body: string;
  whenToUse: string;
}): { name: string; title: string; body: string; whenToUse: string } {
  const name = normalizeName(args.name);
  if (name.length === 0) {
    throw new Error("Name is required (use letters, numbers, hyphens, or underscores)");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Name is too long (max ${MAX_NAME_LENGTH} characters)`);
  }

  const title = args.title.trim();
  if (title.length === 0) {
    throw new Error("Title is required");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`Title is too long (max ${MAX_TITLE_LENGTH} characters)`);
  }

  const whenToUse = args.whenToUse.trim();
  if (whenToUse.length === 0) {
    throw new Error("When to use is required");
  }
  if (whenToUse.length > MAX_WHEN_TO_USE_LENGTH) {
    throw new Error(`When to use is too long (max ${MAX_WHEN_TO_USE_LENGTH} characters)`);
  }

  const body = args.body.trim();
  if (body.length === 0) {
    throw new Error("Instructions body cannot be empty");
  }
  if (body.length > MAX_BODY_LENGTH) {
    throw new Error(`Instructions body is too long (max ${MAX_BODY_LENGTH.toLocaleString()} characters)`);
  }

  return { name, title, body, whenToUse };
}

async function findByName(
  ctx: QueryCtx | MutationCtx,
  name: string,
): Promise<Doc<"assistantNamedInstructions"> | null> {
  return await ctx.db
    .query("assistantNamedInstructions")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
}

async function listAllInstructions(
  ctx: QueryCtx | MutationCtx,
): Promise<Array<Doc<"assistantNamedInstructions">>> {
  const rows = await ctx.db.query("assistantNamedInstructions").take(MAX_LIST);
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function buildNamedInstructionsToolDescription(
  context: NamedInstructionsToolContext,
  addon?: string,
): string {
  const base = ASSISTANT_TOOL_CATALOG.getNamedInstructions.defaultDescription;
  const lines = context.instructions.map((item) => {
    const when = item.whenToUse.trim();
    return when.length > 0
      ? `- "${item.name}" (${item.title}): ${when}`
      : `- "${item.name}" (${item.title})`;
  });

  const catalogBlock =
    lines.length > 0
      ? `Available instruction packs (pass exact names):\n${lines.join("\n")}`
      : "No instruction packs are currently available.";

  const withCatalog = `${base}\n\n${catalogBlock}`;
  const trimmedAddon = addon?.trim();
  if (!trimmedAddon) {
    return withCatalog;
  }
  return `${withCatalog}\n\nAdditional guidance:\n${trimmedAddon}`;
}

export const listNamedInstructions = query({
  args: {},
  returns: v.array(namedInstructionAdminValidator),
  handler: async (ctx) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const rows = await listAllInstructions(ctx);
    return rows.map((row) => ({
      _id: row._id,
      name: row.name,
      title: row.title,
      body: row.body,
      whenToUse: row.whenToUse,
      enabled: row.enabled,
      sortOrder: row.sortOrder,
      updatedAt: row.updatedAt,
    }));
  },
});

export const createNamedInstruction = mutation({
  args: {
    name: v.string(),
    title: v.string(),
    body: v.string(),
    whenToUse: v.string(),
    enabled: v.optional(v.boolean()),
  },
  returns: namedInstructionAdminValidator,
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Authentication required");
    }

    const fields = validateInstructionFields(args);
    const existing = await findByName(ctx, fields.name);
    if (existing) {
      throw new Error(`An instruction named "${fields.name}" already exists`);
    }

    const existingRows = await listAllInstructions(ctx);
    const maxSort = existingRows.reduce((max, row) => Math.max(max, row.sortOrder), -1);
    const now = Date.now();
    const id = await ctx.db.insert("assistantNamedInstructions", {
      ...fields,
      enabled: args.enabled ?? true,
      sortOrder: maxSort + 1,
      updatedAt: now,
      updatedBy: userId,
    });

    const created = await ctx.db.get(id);
    if (!created) {
      throw new Error("Failed to create instruction");
    }

    return {
      _id: created._id,
      name: created.name,
      title: created.title,
      body: created.body,
      whenToUse: created.whenToUse,
      enabled: created.enabled,
      sortOrder: created.sortOrder,
      updatedAt: created.updatedAt,
    };
  },
});

export const updateNamedInstruction = mutation({
  args: {
    id: v.id("assistantNamedInstructions"),
    name: v.optional(v.string()),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    whenToUse: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  returns: namedInstructionAdminValidator,
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Authentication required");
    }

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Instruction not found");
    }

    if (
      args.name === undefined &&
      args.title === undefined &&
      args.body === undefined &&
      args.whenToUse === undefined &&
      args.enabled === undefined
    ) {
      throw new Error("Nothing to update");
    }

    const fields = validateInstructionFields({
      name: args.name ?? existing.name,
      title: args.title ?? existing.title,
      body: args.body ?? existing.body,
      whenToUse: args.whenToUse ?? existing.whenToUse,
    });

    if (fields.name !== existing.name) {
      const conflict = await findByName(ctx, fields.name);
      if (conflict && conflict._id !== existing._id) {
        throw new Error(`An instruction named "${fields.name}" already exists`);
      }
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      ...fields,
      enabled: args.enabled ?? existing.enabled,
      updatedAt: now,
      updatedBy: userId,
    });

    const updated = await ctx.db.get(args.id);
    if (!updated) {
      throw new Error("Instruction not found after update");
    }

    return {
      _id: updated._id,
      name: updated.name,
      title: updated.title,
      body: updated.body,
      whenToUse: updated.whenToUse,
      enabled: updated.enabled,
      sortOrder: updated.sortOrder,
      updatedAt: updated.updatedAt,
    };
  },
});

export const deleteNamedInstruction = mutation({
  args: {
    id: v.id("assistantNamedInstructions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUser(ctx, { requireGodOrTech: true });
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Instruction not found");
    }
    await ctx.db.delete(args.id);
    return null;
  },
});

export const getNamedInstructionsToolContextInternal = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      instructions: v.array(
        v.object({
          name: v.string(),
          title: v.string(),
          whenToUse: v.string(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx): Promise<NamedInstructionsToolContext | null> => {
    const enabled = await ctx.db
      .query("assistantNamedInstructions")
      .withIndex("by_enabled_and_sortOrder", (q) => q.eq("enabled", true))
      .take(MAX_LIST);

    if (enabled.length === 0) {
      return null;
    }

    const sorted = [...enabled].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );

    return {
      instructions: sorted.map((row) => ({
        name: row.name,
        title: row.title,
        whenToUse: row.whenToUse,
      })),
    };
  },
});

export const getNamedInstructionsInternal = internalQuery({
  args: {
    names: v.array(v.string()),
  },
  returns: v.array(namedInstructionResultValidator),
  handler: async (ctx, args) => {
    const requested = args.names
      .map((name) => normalizeName(name))
      .filter((name) => name.length > 0)
      .slice(0, 10);

    const uniqueNames = [...new Set(requested)];
    const results = [];

    for (const name of uniqueNames) {
      const row = await findByName(ctx, name);
      if (!row || !row.enabled) {
        results.push({
          name,
          title: "",
          body: "",
          found: false,
        });
        continue;
      }

      results.push({
        name: row.name,
        title: row.title,
        body: row.body,
        found: true,
      });
    }

    return results;
  },
});
