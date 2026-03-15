import { Schema } from "effect";

const FOLDER_ID_PATTERN = /^folder_[\da-hjkmnp-tv-z]{26}$/;

export const folderIdSchema = Schema.String.pipe(
  Schema.minLength(1, { message: () => "folder id is required" }),
  Schema.pattern(FOLDER_ID_PATTERN, {
    message: () => "invalid folder id format",
  }),
);

const trimmedName = Schema.String.pipe(
  Schema.compose(Schema.Trim),
  Schema.minLength(1, { message: () => "name is required" }),
  Schema.maxLength(100, { message: () => "name is too long" }),
);

export const createFolderSchema = Schema.Struct({
  name: trimmedName,
});

export const renameFolderSchema = Schema.Struct({
  folderId: folderIdSchema,
  name: trimmedName,
});
