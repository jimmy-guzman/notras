import { z } from "zod";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
] as const;

const NOTE_ID_PATTERN = /^note_[\da-hjkmnp-tv-z]{26}$/;

export const deleteAssetSchema = z.object({
  assetId: z
    .string()
    .min(1, "Asset ID is required")
    .regex(/^asset_[\da-hjkmnp-tv-z]{26}$/, "Invalid asset ID format"),
  noteId: z
    .string()
    .min(1, "Note ID is required")
    .regex(NOTE_ID_PATTERN, "Invalid note ID format"),
});

export const uploadAssetsSchema = z.object({
  files: z
    .array(
      z
        .instanceof(File)
        .refine((file) => file.size > 0, "File cannot be empty")
        .refine(
          (file) => file.size <= MAX_FILE_SIZE,
          `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        )
        .refine(
          (file) => {
            return ALLOWED_MIME_TYPES.includes(
              file.type as (typeof ALLOWED_MIME_TYPES)[number],
            );
          },
          `File type must be one of: ${ALLOWED_MIME_TYPES.join(", ")}`,
        ),
    )
    .min(1, "At least one file is required"),
  noteId: z
    .string()
    .min(1, "Note ID is required")
    .regex(NOTE_ID_PATTERN, "Invalid note ID format"),
});
