import { z } from "zod";

export const personalTestCreateSchema = z.object({
  name: z
    .string({ required_error: "Name is required." })
    .trim()
    .min(1, "Name is required.")
    .max(120, "Name must be 120 characters or less."),
  nameAr: z
    .string({ required_error: "Arabic name is required." })
    .trim()
    .min(1, "Arabic name is required.")
    .max(120, "Arabic name must be 120 characters or less."),
});

const optionalHexColor = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .refine(
    (value) => value === undefined || /^#[0-9A-Fa-f]{6}$/.test(value),
    "Use a hex color like #E91E8C.",
  );

export const personalTestUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(120, "Name must be 120 characters or less."),
  nameAr: z
    .string()
    .trim()
    .min(1, "Arabic name is required.")
    .max(120, "Arabic name must be 120 characters or less."),
  displayOrder: z
    .number()
    .int("Ordering must be a whole number.")
    .min(0, "Ordering must be 0 or greater.")
    .max(1000, "Ordering must be 1000 or less."),
  description: z
    .string()
    .trim()
    .max(2000, "Description must be 2000 characters or less.")
    .optional(),
  descriptionAr: z
    .string()
    .trim()
    .max(2000, "Arabic description must be 2000 characters or less.")
    .optional(),
  resultSettings: z.object({
    showAll: z.boolean(),
    maxCourses: z.number().int().min(1).max(100).optional(),
  }),
  startButtonColor: optionalHexColor.optional(),
  startButtonText: z
    .string()
    .trim()
    .max(80, "Start button text must be 80 characters or less.")
    .optional()
    .transform((value) => (value ? value : undefined)),
  startButtonTextAr: z
    .string()
    .trim()
    .max(80, "Arabic start button text must be 80 characters or less.")
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export const personalTestQuestionSchema = z.object({
  title: z
    .string({ required_error: "Question title is required." })
    .trim()
    .min(1, "Question title is required.")
    .max(500, "Question title must be 500 characters or less."),
  titleAr: z
    .string({ required_error: "Arabic question title is required." })
    .trim()
    .min(1, "Arabic question title is required.")
    .max(500, "Arabic question title must be 500 characters or less."),
  answerType: z.enum(["single", "multi"]),
  answers: z
    .array(
      z.object({
        text: z.string().trim().min(1, "Answer text is required.").max(500),
        textAr: z.string().trim().min(1, "Arabic answer text is required.").max(500),
      }),
    )
    .min(1, "At least one answer is required."),
});

export const personalTestResultSchema = z
  .object({
    title: z
      .string({ required_error: "Result title is required." })
      .trim()
      .min(1, "Result title is required.")
      .max(200, "Result title must be 200 characters or less."),
    titleAr: z
      .string({ required_error: "Arabic result title is required." })
      .trim()
      .min(1, "Arabic result title is required.")
      .max(200, "Arabic result title must be 200 characters or less."),
    description: z
      .string()
      .trim()
      .max(2000, "Description must be 2000 characters or less.")
      .optional()
      .transform((value) => (value ? value : undefined)),
    descriptionAr: z
      .string()
      .trim()
      .max(2000, "Arabic description must be 2000 characters or less.")
      .optional()
      .transform((value) => (value ? value : undefined)),
    color: optionalHexColor.optional(),
    recommendedCourseIds: z.array(z.string()).default([]),
    ctaEnabled: z.boolean(),
    ctaText: z
      .string()
      .trim()
      .max(80, "Button text must be 80 characters or less.")
      .optional(),
    ctaTextAr: z
      .string()
      .trim()
      .max(80, "Arabic button text must be 80 characters or less.")
      .optional(),
    ctaUrl: z
      .string()
      .trim()
      .max(500, "Button link must be 500 characters or less.")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.ctaEnabled) {
      return;
    }
    if (!data.ctaText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ctaText"],
        message: "Button text is required.",
      });
    }
    if (!data.ctaTextAr) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ctaTextAr"],
        message: "Arabic button text is required.",
      });
    }
    if (!data.ctaUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ctaUrl"],
        message: "Button link is required.",
      });
    } else {
      try {
        const parsed = new URL(data.ctaUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new Error("Invalid protocol");
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ctaUrl"],
          message: "Enter a valid URL starting with http:// or https://.",
        });
      }
    }
  });

export type PersonalTestCreateInput = z.infer<typeof personalTestCreateSchema>;
export type PersonalTestUpdateInput = z.infer<typeof personalTestUpdateSchema>;
export type PersonalTestQuestionInput = z.infer<typeof personalTestQuestionSchema>;
export type PersonalTestResultInput = z.infer<typeof personalTestResultSchema>;

export const MIN_TEST_DURATION_SECONDS = 1;
/** Maximum time allowed on a single test attempt (6 hours). */
export const MAX_TEST_DURATION_SECONDS = 6 * 60 * 60;
export const MAX_TEST_ATTEMPT_LIFETIME_MS = MAX_TEST_DURATION_SECONDS * 1000;

export const personalTestDurationSchema = z
  .number()
  .int("Duration must be a whole number of seconds.")
  .min(MIN_TEST_DURATION_SECONDS, "Duration must be greater than 0 seconds.")
  .max(
    MAX_TEST_DURATION_SECONDS,
    "Duration must be at most 6 hours.",
  );

export const personalTestCompleteAttemptSchema = z.object({
  durationSeconds: personalTestDurationSchema,
  selectedAnswerIds: z.array(z.string()).min(1, "Select at least one answer."),
});

export type PersonalTestCompleteAttemptInput = z.infer<
  typeof personalTestCompleteAttemptSchema
>;
