"use server";

import { z } from "zod";

import type { AssetMetadata } from "@/server/services/asset-service";

import { serverAction } from "@/lib/authorized";
import { toNoteId } from "@/lib/id";
import { getAssetService } from "@/server/services/asset-service";

const noteIdSchema = z
  .string()
  .regex(/^note_[\da-hjkmnp-tv-z]{26}$/, "Invalid note ID format");

export async function getAssets(noteId: string): Promise<AssetMetadata[]> {
  const validNoteId = noteIdSchema.parse(noteId);

  return serverAction(async (userId) => {
    return getAssetService().list(userId, toNoteId(validNoteId));
  });
}
