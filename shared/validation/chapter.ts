import { z } from "zod";

export const chapterInputSchema = z.object({
  title: z
    .string({
      required_error: "Title (EN) is required.",
    })
    .trim()
    .min(1, "Title (EN) is required.")
    .max(128, "Title must be 128 characters or less."),
  titleAr: z
    .string({
      required_error: "Title (AR) is required.",
    })
    .trim()
    .min(1, "Title (AR) is required.")
    .max(128, "Arabic title must be 128 characters or less."),
});

export type ChapterInput = z.infer<typeof chapterInputSchema>;
