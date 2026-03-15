import { Effect, Schema } from "effect";

import type { AssetMetadata } from "@/server/services/asset-service";

import { toNoteId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import { noteIdSchema } from "@/server/schemas/note-schemas";
import { AssetService } from "@/server/services/asset-service";
import { UserService } from "@/server/services/user-service";

export async function getAssets(noteId: string): Promise<AssetMetadata[]> {
  const validNoteId = Schema.decodeUnknownSync(noteIdSchema)(noteId);

  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );

  return AppRuntime.runPromise(
    AssetService.pipe(
      Effect.flatMap((svc) => svc.list(userId, toNoteId(validNoteId))),
    ),
  );
}
