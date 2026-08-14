import { Schema } from "effect";

export const preferencesSchema = Schema.Struct({
  markdownPreview: Schema.optionalWith(Schema.Boolean, {
    default: () => {
      return false;
    },
  }),
  syntaxHighlighting: Schema.optionalWith(Schema.Boolean, {
    default: () => {
      return false;
    },
  }),
});

export type Preferences = Schema.Schema.Type<typeof preferencesSchema>;

const EMAIL_PATTERN = /^[^\s@]+@(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}$/i;

export const updateProfileSchema = Schema.Struct({
  email: Schema.String.pipe(
    Schema.pattern(EMAIL_PATTERN, {
      message: () => {
        return "Please enter a valid email address";
      },
    }),
  ),
  name: Schema.String.pipe(
    Schema.compose(Schema.Trim),
    Schema.minLength(1, {
      message: () => {
        return "Name is required";
      },
    }),
  ),
});
