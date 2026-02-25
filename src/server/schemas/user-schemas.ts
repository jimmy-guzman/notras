import { z } from "zod";

export const preferencesSchema = z.object({
  markdownPreview: z.boolean().default(false),
  syntaxHighlighting: z.boolean().default(false),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const updateProfileSchema = z.object({
  email: z.email("Please enter a valid email address"),
  name: z.string().trim().min(1, "Name is required"),
});
