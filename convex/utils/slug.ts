import { isUsableSlug, slugify, slugifyPreferringLatin } from "../../shared/slugify";
import type { Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export { isUsableSlug, slugify, slugifyPreferringLatin };

type GenerateUniqueSlugOptions<TableName extends TableNames> = {
  excludeId?: Id<TableName>;
  fallbackSlug?: string;
};

export const generateUniqueSlug = async <TableName extends TableNames>(
  ctx: MutationCtx | QueryCtx,
  tableName: TableName,
  baseSlug: string,
  { excludeId, fallbackSlug }: GenerateUniqueSlugOptions<TableName> = {},
) => {
  const slugifiedBase = slugify(baseSlug);
  const slugifiedFallback = slugify(fallbackSlug ?? tableName);
  const normalizedBase = isUsableSlug(slugifiedBase)
    ? slugifiedBase
    : isUsableSlug(slugifiedFallback)
      ? slugifiedFallback
      : "item";

  let candidate = normalizedBase;
  let counter = 1;

  while (true) {
    const matches = await ctx.db
      .query(tableName)
      // @ts-expect-error Convex doesn't infer index names from generics yet.
      .withIndex("slug", (q) => q.eq("slug", candidate))
      .collect();

    const hasConflict = matches.some((item) => item._id !== excludeId);

    if (!hasConflict) {
      return candidate;
    }

    candidate = `${normalizedBase}-${counter}`;
    counter += 1;
  }
};
