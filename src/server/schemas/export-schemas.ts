import { z } from "zod";

const NOTE_ID_PATTERN = /^note_[\da-hjkmnp-tv-z]{26}$/;
const ASSET_ID_PATTERN = /^asset_[\da-hjkmnp-tv-z]{26}$/;

export const manifestSchema = z.object({
  assetCount: z.number().int().nonnegative(),
  exportedAt: z.iso.datetime(),
  noteCount: z.number().int().nonnegative(),
  version: z.literal(1),
});

export const exportedAssetSchema = z.object({
  createdAt: z.iso.datetime(),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  height: z.number().int().nonnegative(),
  id: z.string().regex(ASSET_ID_PATTERN, "Invalid asset ID format"),
  mimeType: z.string().min(1),
  path: z.string().min(1),
  width: z.number().int().nonnegative(),
});

export const exportedNoteSchema = z.object({
  assets: z.array(exportedAssetSchema),
  content: z.string().min(1),
  createdAt: z.iso.datetime(),
  id: z.string().regex(NOTE_ID_PATTERN, "Invalid note ID format"),
  pinnedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});

export const exportDataSchema = z.array(exportedNoteSchema);

export const importModeSchema = z.enum(["merge", "mirror"]);

export const importInputSchema = z.object({
  file: z
    .instanceof(File, { message: "please select a file" })
    .refine((f) => f.size > 0, { message: "file is empty" }),
  mode: importModeSchema,
});

export type ExportedAsset = z.infer<typeof exportedAssetSchema>;
export type ExportedNote = z.infer<typeof exportedNoteSchema>;
export type ImportMode = z.infer<typeof importModeSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
