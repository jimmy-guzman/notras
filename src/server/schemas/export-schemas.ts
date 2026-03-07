import { Schema } from "effect";

import { ASSET_ID_PATTERN } from "@/server/schemas/asset-schemas";
import { NOTE_ID_PATTERN } from "@/server/schemas/note-schemas";

const FOLDER_ID_PATTERN = /^folder_[\da-hjkmnp-tv-z]{26}$/;
const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const IsoDateTimeString = Schema.String.pipe(
  Schema.pattern(ISO_DATETIME_PATTERN, {
    message: () => "Invalid ISO datetime string",
  }),
);

export const manifestSchema = Schema.Struct({
  assetCount: Schema.Int.pipe(Schema.nonNegative()),
  exportedAt: IsoDateTimeString,
  folderCount: Schema.optional(Schema.Int.pipe(Schema.nonNegative())),
  noteCount: Schema.Int.pipe(Schema.nonNegative()),
  version: Schema.Literal(1),
});

export const exportedAssetSchema = Schema.Struct({
  createdAt: IsoDateTimeString,
  fileName: Schema.String.pipe(Schema.minLength(1)),
  fileSize: Schema.Int.pipe(Schema.positive()),
  height: Schema.Int.pipe(Schema.nonNegative()),
  id: Schema.String.pipe(
    Schema.pattern(ASSET_ID_PATTERN, {
      message: () => "Invalid asset ID format",
    }),
  ),
  mimeType: Schema.String.pipe(Schema.minLength(1)),
  path: Schema.String.pipe(Schema.minLength(1)),
  width: Schema.Int.pipe(Schema.nonNegative()),
});

export const exportedFolderSchema = Schema.Struct({
  createdAt: IsoDateTimeString,
  id: Schema.String.pipe(
    Schema.pattern(FOLDER_ID_PATTERN, {
      message: () => "Invalid folder ID format",
    }),
  ),
  name: Schema.String.pipe(Schema.minLength(1)),
  updatedAt: IsoDateTimeString,
});

export const exportedNoteSchema = Schema.Struct({
  assets: Schema.Array(exportedAssetSchema),
  content: Schema.String.pipe(Schema.minLength(1)),
  createdAt: IsoDateTimeString,
  folderId: Schema.optional(
    Schema.NullOr(
      Schema.String.pipe(
        Schema.pattern(FOLDER_ID_PATTERN, {
          message: () => "Invalid folder ID format",
        }),
      ),
    ),
  ),
  id: Schema.String.pipe(
    Schema.pattern(NOTE_ID_PATTERN, {
      message: () => "Invalid note ID format",
    }),
  ),
  pinnedAt: Schema.NullOr(IsoDateTimeString),
  tags: Schema.optional(Schema.Array(Schema.String)),
  updatedAt: IsoDateTimeString,
});

export const exportDataSchema = Schema.Array(exportedNoteSchema);

export const exportFolderDataSchema = Schema.Array(exportedFolderSchema);

export const importModeSchema = Schema.Literal("merge", "mirror");

const MAX_IMPORT_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export const importInputSchema = Schema.Struct({
  file: Schema.instanceOf(File, { message: () => "please select a file" }).pipe(
    Schema.filter((f) => f.size > 0),
    Schema.filter((f) => f.size <= MAX_IMPORT_SIZE_BYTES),
  ),
  mode: importModeSchema,
});

export type ExportedAsset = Schema.Schema.Type<typeof exportedAssetSchema>;
export type ExportedFolder = Schema.Schema.Type<typeof exportedFolderSchema>;
export type ExportedNote = Schema.Schema.Type<typeof exportedNoteSchema>;
export type ImportMode = Schema.Schema.Type<typeof importModeSchema>;
export type Manifest = Schema.Schema.Type<typeof manifestSchema>;
