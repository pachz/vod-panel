import { z } from "zod";

export const userInputSchema = z.object({
  name: z
    .string({
      required_error: "Name is required.",
    })
    .trim()
    .min(1, "Name is required.")
    .max(100, "Name must be 100 characters or less."),
  email: z
    .string({
      required_error: "Email is required.",
    })
    .trim()
    .min(1, "Email is required.")
    .email("Please enter a valid email address.")
    .max(255, "Email must be 255 characters or less.")
    .transform((s) => s.toLowerCase()),
  phone: z
    .string()
    .trim()
    .max(20, "Phone number must be 20 characters or less.")
    .optional()
    .or(z.literal("")),
  password: z
    .string({
      required_error: "Password is required.",
    })
    .min(8, "Password must be at least 8 characters long."),
  isAdmin: z.boolean().optional().default(false),
});

export const userUpdateSchema = z.object({
  name: z
    .string({
      required_error: "Name is required.",
    })
    .trim()
    .min(1, "Name is required.")
    .max(100, "Name must be 100 characters or less."),
  email: z
    .string({
      required_error: "Email is required.",
    })
    .trim()
    .min(1, "Email is required.")
    .email("Please enter a valid email address.")
    .max(255, "Email must be 255 characters or less.")
    .transform((s) => s.toLowerCase()),
  phone: z
    .string()
    .trim()
    .max(20, "Phone number must be 20 characters or less.")
    .optional()
    .or(z.literal("")),
  isAdmin: z.boolean().optional().default(false),
});

export const userPasswordUpdateSchema = z.object({
  password: z
    .string({
      required_error: "Password is required.",
    })
    .min(8, "Password must be at least 8 characters long."),
});

export type UserInput = z.infer<typeof userInputSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type UserPasswordUpdateInput = z.infer<typeof userPasswordUpdateSchema>;

