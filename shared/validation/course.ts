import { z } from "zod";

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
  shortDescription: z
    .string({
      required_error: "Short description is required.",
    })
    .trim()
    .min(1, "Short description is required.")
    .max(512, "Short description must be 512 characters or less."),
  shortDescriptionAr: z
    .string({
      required_error: "Arabic short description is required.",
    })
    .trim()
    .min(1, "Arabic short description is required.")
    .max(512, "Arabic short description must be 512 characters or less."),
  categoryId: z
    .string({
      required_error: "Category is required.",
    })
    .trim()
    .min(1, "Category is required."),
});

export type CourseInput = z.infer<typeof courseInputSchema>;

