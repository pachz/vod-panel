"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Internal action: refetch all lesson links (Vimeo oEmbed) and update durations.
 * Processes lessons sequentially with a configurable delay between each Vimeo call to avoid rate limiting.
 * Updates lesson duration per lesson and recalculates lesson_count and duration on each course.
 */
export const refetchAllLessonDurationsFromVimeo = internalAction({
  args: {
    /** Delay in ms between each Vimeo API call. Default 1000. */
    delayMs: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    updated: v.number(),
    errors: v.number(),
  }),
  handler: async (ctx, { delayMs = 1000 }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- breaks circular type ref with lesson module
    const lessonInternal = (internal as any).lesson;
    const lessons = await ctx.runQuery(lessonInternal.listAllVideoLessonsWithVimeoUrl, {});
    let updated = 0;
    let errors = 0;

    for (let i = 0; i < lessons.length; i++) {
      if (i > 0) {
        await sleep(delayMs);
      }
      const { lessonId, videoUrl } = lessons[i];
      try {
        let normalizedUrl = videoUrl;
        if (videoUrl.includes("player.vimeo.com")) {
          const videoIdMatch = videoUrl.match(/player\.vimeo\.com\/video\/(\d+)/);
          if (videoIdMatch) {
            normalizedUrl = `https://vimeo.com/${videoIdMatch[1]}`;
          }
        }
        const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(normalizedUrl)}`;
        const response = await fetch(oembedUrl);
        if (!response.ok) {
          errors += 1;
          continue;
        }
        const data = (await response.json()) as { duration?: number };
        const durationSeconds =
          typeof data.duration === "number" && Number.isFinite(data.duration)
            ? Math.round(data.duration)
            : undefined;
        if (durationSeconds === undefined) {
          errors += 1;
          continue;
        }
        await ctx.runMutation(lessonInternal.updateLessonDurationOnly, {
          lessonId,
          duration: durationSeconds,
        });
        updated += 1;
      } catch {
        errors += 1;
      }
    }

    return {
      processed: lessons.length,
      updated,
      errors,
    };
  },
});
