"use server";

import { Effect, Schema } from "effect";

import type { AssetMetadata } from "@/server/services/asset-service";

import { serverAction } from "@/lib/authorized";
import { toNoteId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import { AssetService } from "@/server/services/asset-service";

const NOTE_ID_PATTERN = /^note_[\da-hjkmnp-tv-z]{26}$/;

const noteIdSchema = Schema.String.pipe(
  Schema.pattern(NOTE_ID_PATTERN, { message: () => "Invalid note ID format" }),
);

export async function getAssets(noteId: string): Promise<AssetMetadata[]> {
  const validNoteId = Schema.decodeUnknownSync(noteIdSchema)(noteId);

  return serverAction(async (userId) => {
    return AppRuntime.runPromise(
      AssetService.pipe(
        Effect.flatMap((svc) => svc.list(userId, toNoteId(validNoteId))),
      ),
    );
  });
}
