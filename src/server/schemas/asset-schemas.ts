import { Schema } from "effect";

import { NOTE_ID_PATTERN } from "@/server/schemas/note-schemas";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
] as const;

const ASSET_ID_PATTERN = /^asset_[\da-hjkmnp-tv-z]{26}$/;

const validFile = Schema.instanceOf(File).pipe(
  Schema.filter((file) => file.size > 0),
  Schema.filter((file) => file.size <= MAX_FILE_SIZE),
  Schema.filter((file) => ALLOWED_MIME_TYPES.includes(file.type as never)),
);

export const deleteAssetSchema = Schema.Struct({
  assetId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Asset ID is required" }),
    Schema.pattern(ASSET_ID_PATTERN, {
      message: () => "Invalid asset ID format",
    }),
  ),
  noteId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Note ID is required" }),
    Schema.pattern(NOTE_ID_PATTERN, {
      message: () => "Invalid note ID format",
    }),
  ),
});

export const uploadAssetsSchema = Schema.Struct({
  files: Schema.Array(validFile).pipe(
    Schema.minItems(1, { message: () => "At least one file is required" }),
  ),
  noteId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Note ID is required" }),
    Schema.pattern(NOTE_ID_PATTERN, {
      message: () => "Invalid note ID format",
    }),
  ),
});
