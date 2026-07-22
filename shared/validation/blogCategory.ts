import { z } from "zod";

const hexColorRegex = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

export const blogCategoryInputSchema = z.object({
  name: z
    .string({ required_error: "Name is required." })
    .trim()
    .min(1, "Name is required.")
    .max(40, "Name must be 40 characters or less."),
  nameAr: z
    .string({ required_error: "Arabic name is required." })
    .trim()
    .min(1, "Arabic name is required.")
    .max(40, "Arabic name must be 40 characters or less."),
  color: z
    .string({ required_error: "Color is required." })
    .trim()
    .regex(hexColorRegex, "Color must be a valid hex value (e.g. #E91E8C)."),
});

export type BlogCategoryInput = z.infer<typeof blogCategoryInputSchema>;
