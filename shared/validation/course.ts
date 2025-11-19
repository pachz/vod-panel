import { z } from "zod";

const optionalTrimmedString = (max: number, message: string) =>
  z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().max(max, message).optional());

const optionalUrl = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().url("Please enter a valid URL.").max(2048, "URL must be 2048 characters or less.").optional());

export const courseInputSchema = z.object({
  name: z
    .string({
      required_error: "Name is required.",
    })
    .trim()
    .min(1, "Name is required.")
    .max(64, "Name must be 64 characters or less."),
  nameAr: z
    .string({
      required_error: "Arabic name is required.",
    })
    .trim()
    .min(1, "Arabic name is required.")
    .max(64, "Arabic name must be 64 characters or less."),
  shortDescription: optionalTrimmedString(
    512,
    "Short description must be 512 characters or less.",
  ),
  shortDescriptionAr: optionalTrimmedString(
    512,
    "Arabic short description must be 512 characters or less.",
  ),
  categoryId: z
    .string({
      required_error: "Category is required.",
    })
    .trim()
    .min(1, "Category is required."),
});

export const courseUpdateSchema = courseInputSchema.extend({
  description: optionalTrimmedString(
    4096,
    "Full description must be 4096 characters or less.",
  ),
  descriptionAr: optionalTrimmedString(
    4096,
    "Arabic full description must be 4096 characters or less.",
  ),
  status: z.enum(["draft", "published", "archived"]),
  trialVideoUrl: optionalUrl,
  instructor: optionalTrimmedString(
    128,
    "Instructor name must be 128 characters or less.",
  ),
});

export type CourseInput = z.infer<typeof courseInputSchema>;
export type CourseUpdateInput = z.infer<typeof courseUpdateSchema>;