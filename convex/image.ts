"use node";

import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Jimp, JimpMime, ResizeStrategy } from "jimp";
import { requireUserAction } from "./utils/auth";

/**
 * Action to generate a thumbnail from an uploaded image
 * This runs in Node.js environment to use jimp for image processing
 */
export const generateThumbnail = action({
  args: {
    storageId: v.id("_storage"),
    maxWidth: v.optional(v.number()),
    maxHeight: v.optional(v.number()),
    quality: v.optional(v.number()),
  },
  handler: async (ctx, { storageId, maxWidth = 400, maxHeight = 300, quality = 85 }) => {
    // Verify user is authenticated
    await requireUserAction(ctx);
    try {
      // Get the image from storage
      const imageBlob = await ctx.storage.get(storageId);
      if (!imageBlob) {
        throw new ConvexError({
          code: "STORAGE_ERROR",
          message: "Could not retrieve image from storage.",
        });
      }

      // Convert blob to buffer
      const arrayBuffer = await imageBlob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Load and resize the image using jimp
      const image = await Jimp.read(buffer);
      
      // Calculate new dimensions while maintaining aspect ratio
      const imageWidth = image.width;
      const imageHeight = image.height;
      
      let newWidth = imageWidth;
      let newHeight = imageHeight;
      
      // Only resize if image is larger than max dimensions
      if (imageWidth > maxWidth || imageHeight > maxHeight) {
        const aspectRatio = imageWidth / imageHeight;
        
        if (imageWidth > imageHeight) {
          // Landscape: fit to width
          newWidth = Math.min(imageWidth, maxWidth);
          newHeight = Math.round(newWidth / aspectRatio);
          if (newHeight > maxHeight) {
            newHeight = maxHeight;
            newWidth = Math.round(newHeight * aspectRatio);
          }
        } else {
          // Portrait or square: fit to height
          newHeight = Math.min(imageHeight, maxHeight);
          newWidth = Math.round(newHeight * aspectRatio);
          if (newWidth > maxWidth) {
            newWidth = maxWidth;
            newHeight = Math.round(newWidth / aspectRatio);
          }
        }
      }
      
      // Resize the image
      image.resize({
        w: newWidth,
        h: newHeight,
        mode: ResizeStrategy.BILINEAR,
      });

      // Get the resized image as a buffer in JPEG format with quality
      const resizedBuffer = await image.getBuffer(JimpMime.jpeg, { quality });

      // Upload the resized image to storage
      // Convert Buffer to Uint8Array for Blob compatibility
      const uint8Array = new Uint8Array(resizedBuffer);
      const thumbnailStorageId = await ctx.storage.store(
        new Blob([uint8Array], { type: "image/jpeg" })
      );

      return thumbnailStorageId;
    } catch (error) {
      console.error("Error generating thumbnail:", error);
      throw new ConvexError({
        code: "IMAGE_PROCESSING_ERROR",
        message: error instanceof Error ? error.message : "Failed to generate thumbnail.",
      });
    }
  },
});

/**
 * Action to convert an image to JPEG format with specified quality
 * This runs in Node.js environment to use jimp for image processing
 */
export const convertToJpeg = action({
  args: {
    storageId: v.id("_storage"),
    quality: v.optional(v.number()),
  },
  handler: async (ctx, { storageId, quality = 85 }) => {
    // Verify user is authenticated
    await requireUserAction(ctx);
    try {
      // Get the image from storage
      const imageBlob = await ctx.storage.get(storageId);
      if (!imageBlob) {
        throw new ConvexError({
          code: "STORAGE_ERROR",
          message: "Could not retrieve image from storage.",
        });
      }

      // Convert blob to buffer
      const arrayBuffer = await imageBlob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Load the image using jimp
      const image = await Jimp.read(buffer);

      // Convert to JPEG with specified quality (no resize)
      const jpegBuffer = await image.getBuffer(JimpMime.jpeg, { quality });

      // Convert Buffer to Uint8Array for Blob compatibility
      const uint8Array = new Uint8Array(jpegBuffer);
      const convertedStorageId = await ctx.storage.store(
        new Blob([uint8Array], { type: "image/jpeg" })
      );

      return convertedStorageId;
    } catch (error) {
      console.error("Error converting image to JPEG:", error);
      throw new ConvexError({
        code: "IMAGE_PROCESSING_ERROR",
        message: error instanceof Error ? error.message : "Failed to convert image to JPEG.",
      });
    }
  },
});

/**
 * Internal action to fetch Vimeo thumbnail from oEmbed API and update lesson
 * This runs in Node.js environment to make HTTP requests
 * Can be called from mutations via scheduler
 */
export const fetchVimeoThumbnailAndUpdateLesson = internalAction({
  args: {
    lessonId: v.id("lessons"),
    videoUrl: v.string(),
  },
  handler: async (ctx, { lessonId, videoUrl }) => {
    try {
      // Normalize Vimeo URL - convert player.vimeo.com to vimeo.com format for oEmbed
      let normalizedUrl = videoUrl;
      if (videoUrl.includes("player.vimeo.com")) {
        // Extract video ID from player.vimeo.com/video/ID
        const videoIdMatch = videoUrl.match(/player\.vimeo\.com\/video\/(\d+)/);
        if (videoIdMatch) {
          normalizedUrl = `https://vimeo.com/${videoIdMatch[1]}`;
        }
      } else if (videoUrl.includes("vimeo.com")) {
        // Ensure it's in the right format
        normalizedUrl = videoUrl;
      } else {
        throw new ConvexError({
          code: "INVALID_URL",
          message: "URL must be from vimeo.com or player.vimeo.com",
        });
      }

      // Call Vimeo oEmbed API
      const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(normalizedUrl)}`;
      const response = await fetch(oembedUrl);
      
      if (!response.ok) {
        throw new ConvexError({
          code: "VIMEO_API_ERROR",
          message: `Failed to fetch thumbnail from Vimeo: ${response.statusText}`,
        });
      }

      const data = await response.json();
      
      if (!data.thumbnail_url) {
        throw new ConvexError({
          code: "VIMEO_API_ERROR",
          message: "No thumbnail_url found in Vimeo oEmbed response",
        });
      }

      // If the thumbnail width and height are provided, resize the thumbnail to max
      let target_thumbnail_url = data.thumbnail_url;
      if(data.thumbnail_width && data.thumbnail_height) {
        target_thumbnail_url = data.thumbnail_url.replace(`${data.thumbnail_width}x${data.thumbnail_height}`, ``);
      }

      // Download the thumbnail image
      const thumbnailResponse = await fetch(target_thumbnail_url);
      
      if (!thumbnailResponse.ok) {
        throw new ConvexError({
          code: "IMAGE_DOWNLOAD_ERROR",
          message: `Failed to download thumbnail: ${thumbnailResponse.statusText}`,
        });
      }

      // Get the image as a blob
      const thumbnailBlob = await thumbnailResponse.blob();

      // Read the arrayBuffer first so we can use it for both storage and resizing
      const arrayBuffer = await thumbnailBlob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Store the full-size image in Convex storage as cover_image_url
      // Create a new blob from the arrayBuffer for storage
      const coverBlob = new Blob([arrayBuffer], { type: thumbnailBlob.type });
      const coverStorageId = await ctx.storage.store(coverBlob);

      // Get the URL for the stored cover image
      const coverImageUrl = await ctx.storage.getUrl(coverStorageId);

      if (!coverImageUrl) {
        throw new ConvexError({
          code: "STORAGE_ERROR",
          message: "Could not generate URL for stored cover image",
        });
      }

      // Resize the image for thumbnail using the buffer we already read

      // Load and resize the image using jimp
      const image = await Jimp.read(buffer);
      
      // Calculate new dimensions while maintaining aspect ratio
      const maxWidth = 400;
      const maxHeight = 300;
      const imageWidth = image.width;
      const imageHeight = image.height;
      
      let newWidth = imageWidth;
      let newHeight = imageHeight;
      
      // Only resize if image is larger than max dimensions
      if (imageWidth > maxWidth || imageHeight > maxHeight) {
        const aspectRatio = imageWidth / imageHeight;
        
        if (imageWidth > imageHeight) {
          // Landscape: fit to width
          newWidth = Math.min(imageWidth, maxWidth);
          newHeight = Math.round(newWidth / aspectRatio);
          if (newHeight > maxHeight) {
            newHeight = maxHeight;
            newWidth = Math.round(newHeight * aspectRatio);
          }
        } else {
          // Portrait or square: fit to height
          newHeight = Math.min(imageHeight, maxHeight);
          newWidth = Math.round(newHeight * aspectRatio);
          if (newWidth > maxWidth) {
            newWidth = maxWidth;
            newHeight = Math.round(newWidth / aspectRatio);
          }
        }
      }
      
      // Resize the image
      image.resize({
        w: newWidth,
        h: newHeight,
        mode: ResizeStrategy.BILINEAR,
      });

      // Get the resized image as a buffer in JPEG format with quality
      const quality = 85;
      const resizedBuffer = await image.getBuffer(JimpMime.jpeg, { quality });

      // Upload the resized image to storage
      // Convert Buffer to Uint8Array for Blob compatibility
      const uint8Array = new Uint8Array(resizedBuffer);
      const thumbnailStorageId = await ctx.storage.store(
        new Blob([uint8Array], { type: "image/jpeg" })
      );

      // Get the URL for the stored thumbnail image
      const thumbnailImageUrl = await ctx.storage.getUrl(thumbnailStorageId);

      if (!thumbnailImageUrl) {
        throw new ConvexError({
          code: "STORAGE_ERROR",
          message: "Could not generate URL for stored thumbnail image",
        });
      }

      // Update the lesson with both cover and thumbnail URLs
      await ctx.runMutation(internal.lesson.updateLessonImageUrls, {
        lessonId,
        coverImageUrl,
        thumbnailImageUrl,
      });

      return { coverImageUrl, thumbnailImageUrl };
    } catch (error) {
      console.error("Error fetching Vimeo thumbnail:", error);
      // Don't throw - just log the error so the mutation doesn't fail
      // The lesson update will still succeed, just without the thumbnail
      return null;
    }
  },
});

/**
 * Action to fetch Vimeo thumbnail from oEmbed API and save to Convex storage
 * This runs in Node.js environment to make HTTP requests
 * Public action for client use
 */
export const fetchVimeoThumbnail = action({
  args: {
    videoUrl: v.string(),
  },
  handler: async (ctx, { videoUrl }) => {
    // Verify user is authenticated
    await requireUserAction(ctx);
    
    try {
      // Normalize Vimeo URL - convert player.vimeo.com to vimeo.com format for oEmbed
      let normalizedUrl = videoUrl;
      if (videoUrl.includes("player.vimeo.com")) {
        // Extract video ID from player.vimeo.com/video/ID
        const videoIdMatch = videoUrl.match(/player\.vimeo\.com\/video\/(\d+)/);
        if (videoIdMatch) {
          normalizedUrl = `https://vimeo.com/${videoIdMatch[1]}`;
        }
      } else if (videoUrl.includes("vimeo.com")) {
        // Ensure it's in the right format
        normalizedUrl = videoUrl;
      } else {
        throw new ConvexError({
          code: "INVALID_URL",
          message: "URL must be from vimeo.com or player.vimeo.com",
        });
      }

      // Call Vimeo oEmbed API
      const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(normalizedUrl)}`;
      const response = await fetch(oembedUrl);
      
      if (!response.ok) {
        throw new ConvexError({
          code: "VIMEO_API_ERROR",
          message: `Failed to fetch thumbnail from Vimeo: ${response.statusText}`,
        });
      }

      const data = await response.json();
      
      if (!data.thumbnail_url) {
        throw new ConvexError({
          code: "VIMEO_API_ERROR",
          message: "No thumbnail_url found in Vimeo oEmbed response",
        });
      }

      // Download the thumbnail image
      const thumbnailResponse = await fetch(data.thumbnail_url);
      
      if (!thumbnailResponse.ok) {
        throw new ConvexError({
          code: "IMAGE_DOWNLOAD_ERROR",
          message: `Failed to download thumbnail: ${thumbnailResponse.statusText}`,
        });
      }

      // Get the image as a blob
      const thumbnailBlob = await thumbnailResponse.blob();

      // Store the thumbnail in Convex storage
      const storageId = await ctx.storage.store(thumbnailBlob);

      // Get the URL for the stored image
      const imageUrl = await ctx.storage.getUrl(storageId);

      if (!imageUrl) {
        throw new ConvexError({
          code: "STORAGE_ERROR",
          message: "Could not generate URL for stored thumbnail",
        });
      }

      return imageUrl;
    } catch (error) {
      console.error("Error fetching Vimeo thumbnail:", error);
      if (error instanceof ConvexError) {
        throw error;
      }
      throw new ConvexError({
        code: "THUMBNAIL_FETCH_ERROR",
        message: error instanceof Error ? error.message : "Failed to fetch Vimeo thumbnail.",
      });
    }
  },
});

/**
 * Action to validate a video URL and fetch oEmbed data for preview
 * This runs in Node.js environment to make HTTP requests
 * Public action for client use
 */
export const validateVideoUrl = action({
  args: {
    videoUrl: v.string(),
  },
  handler: async (ctx, { videoUrl }) => {
    // Verify user is authenticated
    await requireUserAction(ctx);

    try {
      // Check if URL is from Vimeo
      const isVimeoUrl = videoUrl.includes("vimeo.com") || videoUrl.includes("player.vimeo.com");
      
      if (!isVimeoUrl) {
        throw new ConvexError({
          code: "INVALID_URL",
          message: "Only Vimeo URLs are supported. Please provide a valid Vimeo URL.",
        });
      }

      // Normalize Vimeo URL - convert player.vimeo.com to vimeo.com format for oEmbed
      let normalizedUrl = videoUrl;
      if (videoUrl.includes("player.vimeo.com")) {
        // Extract video ID from player.vimeo.com/video/ID
        const videoIdMatch = videoUrl.match(/player\.vimeo\.com\/video\/(\d+)/);
        if (videoIdMatch) {
          normalizedUrl = `https://vimeo.com/${videoIdMatch[1]}`;
        }
      } else if (videoUrl.includes("vimeo.com")) {
        // Ensure it's in the right format - extract video ID if needed
        const videoIdMatch = videoUrl.match(/vimeo\.com\/(\d+)/);
        if (videoIdMatch) {
          normalizedUrl = `https://vimeo.com/${videoIdMatch[1]}`;
        } else {
          // Try to use as-is
          normalizedUrl = videoUrl;
        }
      }

      // Call Vimeo oEmbed API
      const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(normalizedUrl)}`;
      const response = await fetch(oembedUrl);
      
      if (!response.ok) {
        throw new ConvexError({
          code: "VIMEO_API_ERROR",
          message: `Failed to fetch video information from Vimeo: ${response.statusText}`,
        });
      }

      const data = await response.json();
      
      if (!data.html) {
        throw new ConvexError({
          code: "VIMEO_API_ERROR",
          message: "No embed HTML found in Vimeo oEmbed response",
        });
      }

      return {
        success: true,
        html: data.html,
        title: data.title || "",
        thumbnailUrl: data.thumbnail_url || "",
        width: data.width || 640,
        height: data.height || 360,
      };
    } catch (error) {
      console.error("Error validating video URL:", error);
      if (error instanceof ConvexError) {
        throw error;
      }
      throw new ConvexError({
        code: "VIDEO_VALIDATION_ERROR",
        message: error instanceof Error ? error.message : "Failed to validate video URL.",
      });
    }
  },
});

