import { z } from "zod";

export const categoryInputSchema = z.object({
  name: z
    .string({
      required_error: "Name is required.",
    })
    .trim()
    .min(1, "Name is required.")
    .max(24, "Name must be 24 characters or less."),
  nameAr: z
    .string({
      required_error: "Arabic name is required.",
    })
    .trim()
    .min(1, "Arabic name is required.")
    .max(24, "Arabic name must be 24 characters or less."),
  description: z
    .string({
      required_error: "Description is required.",
    })
    .trim()
    .min(1, "Description is required.")
    .max(1024, "Description must be 1024 characters or less."),
  descriptionAr: z
    .string({
      required_error: "Arabic description is required.",
    })
    .trim()
    .min(1, "Arabic description is required.")
    .max(1024, "Arabic description must be 1024 characters or less."),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;

