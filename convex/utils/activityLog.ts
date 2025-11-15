import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

type EntityType = "category" | "course" | "lesson" | "user" | "video";
type Action = "created" | "updated" | "deleted";

interface LogActivityParams {
  ctx: MutationCtx;
  entityType: EntityType;
  action: Action;
  entityId: string | Id<"categories" | "courses" | "lessons" | "users" | "videos">;
  entityName: string;
}

export async function logActivity({
  ctx,
  entityType,
  action,
  entityId,
  entityName,
}: LogActivityParams): Promise<void> {
  try {
    // Get current user ID
    const userId = await getAuthUserId(ctx);
    
    // Get user name if available
    let userName: string | undefined;
    if (userId) {
      const user = await ctx.db.get(userId as Id<"users">);
      userName = user?.name ?? user?.email ?? undefined;
    }

    // Insert activity log
    // Convert ID to string (Convex IDs are strings at runtime, but TypeScript types them as Id<T>)
    const entityIdString = typeof entityId === "string" ? entityId : (entityId as unknown as string);
    
    await ctx.db.insert("activityLogs", {
      entityType,
      action,
      entityId: entityIdString,
      entityName,
      userId: userId as Id<"users"> | undefined,
      userName,
      timestamp: Date.now(),
    });
  } catch (error) {
    // Don't throw - logging failures shouldn't break the main operation
    console.error("Failed to log activity:", error);
  }
}

