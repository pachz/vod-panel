import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listVideos = query(async ({ db }) => {
  const videos = await db.query("videos").collect();
  return videos.sort((a, b) => b.createdAt - a.createdAt);
});

export const addVideo = mutation({
  args: {
    url: v.string(),
  },
  handler: async ({ db }, { url }) => {
    // Store received URL with a timestamp so items can be ordered later.
    await db.insert("videos", {
      url,
      createdAt: Date.now(),
    });
  },
});
