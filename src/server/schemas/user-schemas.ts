import { z } from "zod";

export const updateProfileSchema = z.object({
  email: z.email("Please enter a valid email address"),
  name: z.string().trim().min(1, "Name is required"),
});
