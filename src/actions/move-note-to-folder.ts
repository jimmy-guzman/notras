"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { toFolderId, toNoteId } from "@/lib/id";
import { authActionClient } from "@/lib/safe-action";
import { AppRuntime } from "@/server/layer";
import { folderIdSchema } from "@/server/schemas/folder-schemas";
import { noteIdSchema } from "@/server/schemas/note-schemas";
import { FolderService } from "@/server/services/folder-service";

export const moveNoteToFolder = authActionClient
  .inputSchema(
    Schema.standardSchemaV1(
      Schema.Struct({
        folderId: Schema.NullOr(folderIdSchema),
        noteId: noteIdSchema,
      }),
    ),
  )
  .action(async ({ ctx, parsedInput }) => {
    await AppRuntime.runPromise(
      FolderService.pipe(
        Effect.flatMap((svc) => {
          return svc.move(
            ctx.userId,
            toNoteId(parsedInput.noteId),
            parsedInput.folderId ? toFolderId(parsedInput.folderId) : null,
          );
        }),
      ),
    );

    updateTag("folders");
    updateTag("notes");
  });
