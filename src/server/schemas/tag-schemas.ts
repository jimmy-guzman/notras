import { z } from "zod";

/** Parses a comma-separated tags string into a de-duped, normalized array. */
export const tagsInputSchema = z.string().transform((val) => {
  return [
    ...new Set(
      val
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0),
    ),
  ];
});
