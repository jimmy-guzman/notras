import { Schema } from "effect";

/** Parses a comma-separated tags string into a de-duped, normalized array. */
export const tagsInputSchema = Schema.transform(
  Schema.String,
  Schema.Array(Schema.String),
  {
    decode: (val) => {
      return [
        ...new Set(
          val
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length > 0),
        ),
      ];
    },
    encode: (arr) => arr.join(", "),
    strict: true,
  },
);
