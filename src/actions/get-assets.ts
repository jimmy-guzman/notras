"use server";

import { Effect, Schema } from "effect";

import type { AssetMetadata } from "@/server/services/asset-service";

import { serverAction } from "@/lib/authorized";
import { toNoteId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import { noteIdSchema } from "@/server/schemas/note-schemas";
import { AssetService } from "@/server/services/asset-service";

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
