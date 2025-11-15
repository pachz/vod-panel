import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { logActivity } from "./utils/activityLog";
import { requireUser } from "./utils/auth";

export const listVideos = query(async ({ db }) => {
  const videos = await db.query("videos").collect();
  return videos.sort((a, b) => b.createdAt - a.createdAt);
});

export const addVideo = mutation({
  args: {
    url: v.string(),
  },
  handler: async (ctx, { url }) => {
    await requireUser(ctx);
    
    // Store received URL with a timestamp so items can be ordered later.
    const videoId = await ctx.db.insert("videos", {
      url,
      createdAt: Date.now(),
    });

    await logActivity({
      ctx,
      entityType: "video",
      action: "created",
      entityId: videoId,
      entityName: url.substring(0, 50) + (url.length > 50 ? "..." : ""), // Truncate long URLs
    });
  },
});
