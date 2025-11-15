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

const optionalDuration = z.preprocess((value) => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().int().min(0, "Duration must be 0 or greater.").max(100000, "Duration seems too large.").optional());

export const lessonInputSchema = z.object({
  title: z
    .string({
      required_error: "Title is required.",
    })
    .trim()
    .min(1, "Title is required.")
    .max(128, "Title must be 128 characters or less."),
  titleAr: z
    .string({
      required_error: "Arabic title is required.",
    })
    .trim()
    .min(1, "Arabic title is required.")
    .max(128, "Arabic title must be 128 characters or less."),
  shortReview: z
    .string({
      required_error: "Short review is required.",
    })
    .trim()
    .min(1, "Short review is required.")
    .max(512, "Short review must be 512 characters or less."),
  shortReviewAr: z
    .string({
      required_error: "Arabic short review is required.",
    })
    .trim()
    .min(1, "Arabic short review is required.")
    .max(512, "Arabic short review must be 512 characters or less."),
  courseId: z
    .string({
      required_error: "Course is required.",
    })
    .trim()
    .min(1, "Course is required."),
  duration: optionalDuration,
  type: z.enum(["video", "article"]),
});

export const lessonUpdateSchema = lessonInputSchema.extend({
  status: z.enum(["draft", "published", "archived"]),
  videoUrl: optionalUrl,
  description: optionalTrimmedString(
    4096,
    "Description must be 4096 characters or less.",
  ),
  descriptionAr: optionalTrimmedString(
    4096,
    "Arabic description must be 4096 characters or less.",
  ),
  learningObjectives: optionalTrimmedString(
    4096,
    "Learning objectives must be 4096 characters or less.",
  ),
  learningObjectivesAr: optionalTrimmedString(
    4096,
    "Arabic learning objectives must be 4096 characters or less.",
  ),
  body: optionalTrimmedString(
    100000,
    "Body must be 100000 characters or less.",
  ),
  bodyAr: optionalTrimmedString(
    100000,
    "Arabic body must be 100000 characters or less.",
  ),
});

export type LessonInput = z.infer<typeof lessonInputSchema>;
export type LessonUpdateInput = z.infer<typeof lessonUpdateSchema>;

