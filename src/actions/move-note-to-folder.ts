"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { toFolderId, toNoteId } from "@/lib/id";
import { authedProcedure } from "@/lib/orpc";
import { AppRuntime } from "@/server/layer";
import { FolderService } from "@/server/services/folder-service";

const FOLDER_ID_PATTERN = /^folder_[\da-hjkmnp-tv-z]{26}$/;
const NOTE_ID_PATTERN = /^note_[\da-hjkmnp-tv-z]{26}$/;

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
