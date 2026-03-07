import { Schema } from "effect";

const trimmedName = Schema.String.pipe(
  Schema.trimmed({ message: () => "name is required" }),
  Schema.minLength(1, { message: () => "name is required" }),
  Schema.maxLength(100, { message: () => "name is too long" }),
);

export const createFolderSchema = Schema.Struct({
  name: trimmedName,
});

export const renameFolderSchema = Schema.Struct({
  folderId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "folder id is required" }),
  ),
  name: trimmedName,
});
