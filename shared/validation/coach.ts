import { z } from "zod";

const trimmedString = (label: string, max: number) =>
  z
    .string({
      required_error: `${label} is required.`,
    })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or less.`);

export const coachInputSchema = z.object({
  name: trimmedString("Name", 64),
  nameAr: trimmedString("Arabic name", 64),
  expertise: trimmedString("Expertise", 128),
  expertiseAr: trimmedString("Arabic expertise", 128),
  description: trimmedString("Description", 1024),
  descriptionAr: trimmedString("Arabic description", 1024),
  rating: z
    .number({
      required_error: "Rating is required.",
      invalid_type_error: "Rating must be a number.",
    })
    .min(0, "Rating cannot be negative.")
    .max(5, "Rating cannot be higher than 5.")
    .refine((value) => Number.isFinite(value), {
      message: "Rating must be a valid number.",
    }),
});

export type CoachInput = z.infer<typeof coachInputSchema>;


