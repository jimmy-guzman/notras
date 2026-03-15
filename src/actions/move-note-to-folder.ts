"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { toFolderId, toNoteId } from "@/lib/id";
import { authedProcedure } from "@/lib/orpc";
import { AppRuntime } from "@/server/layer";
import { FOLDER_ID_PATTERN } from "@/server/schemas/folder-schemas";
import { NOTE_ID_PATTERN } from "@/server/schemas/note-schemas";
import { FolderService } from "@/server/services/folder-service";

export const moveNoteToFolder = authedProcedure
  .input(
    Schema.standardSchemaV1(
      Schema.Struct({
        folderId: Schema.NullOr(
          Schema.String.pipe(
            Schema.pattern(FOLDER_ID_PATTERN, {
              message: () => "invalid folder id format",
            }),
          ),
        ),
        noteId: Schema.String.pipe(
          Schema.pattern(NOTE_ID_PATTERN, {
            message: () => "invalid note id format",
          }),
        ),
      }),
    ),
  )
  .handler(async ({ context, input }) => {
    await AppRuntime.runPromise(
      FolderService.pipe(
        Effect.flatMap((svc) => {
          return svc.move(
            context.userId,
            toNoteId(input.noteId),
            input.folderId ? toFolderId(input.folderId) : null,
          );
        }),
      ),
    );

    updateTag("folders");
    updateTag("notes");
  })
  .actionable();
