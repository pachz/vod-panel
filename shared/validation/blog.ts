import { z } from "zod";

export const blogCreateSchema = z.object({
  title: z
    .string({ required_error: "Title is required." })
    .trim()
    .min(1, "Title is required.")
    .max(200, "Title must be 200 characters or less."),
  titleAr: z
    .string({ required_error: "Arabic title is required." })
    .trim()
    .min(1, "Arabic title is required.")
    .max(200, "Arabic title must be 200 characters or less."),
  categoryId: z
    .string({ required_error: "Category is required." })
    .min(1, "Category is required."),
  authorId: z
    .string({ required_error: "Author is required." })
    .min(1, "Author is required."),
});

export const blogUpdateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(200, "Title must be 200 characters or less."),
  titleAr: z
    .string()
    .trim()
    .min(1, "Arabic title is required.")
    .max(200, "Arabic title must be 200 characters or less."),
  simpleContent: z
    .string()
    .trim()
    .max(1000, "Simple content must be 1000 characters or less."),
  simpleContentAr: z
    .string()
    .trim()
    .max(1000, "Arabic simple content must be 1000 characters or less."),
  body: z
    .string()
    .trim()
    .max(100_000, "Body must be 100000 characters or less."),
  bodyAr: z
    .string()
    .trim()
    .max(100_000, "Arabic body must be 100000 characters or less."),
  categoryId: z.string().min(1, "Category is required."),
  authorId: z.string().min(1, "Author is required."),
  readingTimeMinutes: z
    .number()
    .int("Reading time must be a whole number.")
    .min(1, "Reading time must be at least 1 minute.")
    .max(120, "Reading time must be 120 minutes or less."),
});

export type BlogCreateInput = z.infer<typeof blogCreateSchema>;
export type BlogUpdateInput = z.infer<typeof blogUpdateSchema>;
