"use node";

import { action } from "./_generated/server";
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

