import { Schema } from "effect";

export const preferencesSchema = Schema.Struct({
  markdownPreview: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
  syntaxHighlighting: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
});

export type Preferences = Schema.Schema.Type<typeof preferencesSchema>;

const EMAIL_PATTERN =
  /^[^\s@]+@[^@](?:[^.@]*\.\s)*[^.@]*\.[^\s@]+(?:\s(?:[^.@]*\.\s)*[^.@]*\.[^\s@]+)*$/;

export const updateProfileSchema = Schema.Struct({
  email: Schema.String.pipe(
    Schema.pattern(EMAIL_PATTERN, {
      message: () => "Please enter a valid email address",
    }),
  ),
  name: Schema.String.pipe(
    Schema.trimmed({ message: () => "Name is required" }),
    Schema.minLength(1, { message: () => "Name is required" }),
  ),
});
