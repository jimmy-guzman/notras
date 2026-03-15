"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { toFolderId } from "@/lib/id";
import { authedProcedure } from "@/lib/orpc";
import { AppRuntime } from "@/server/layer";
import { FolderService } from "@/server/services/folder-service";

const FOLDER_ID_PATTERN = /^folder_[\da-hjkmnp-tv-z]{26}$/;

export const deleteFolder = authedProcedure
  .input(
    Schema.standardSchemaV1(
      Schema.Struct({
        folderId: Schema.String.pipe(
          Schema.pattern(FOLDER_ID_PATTERN, {
            message: () => "invalid folder id format",
          }),
        ),
      }),
    ),
  )
  .handler(async ({ context, input }) => {
    await AppRuntime.runPromise(
      FolderService.pipe(
        Effect.flatMap((svc) => {
          return svc.delete(context.userId, toFolderId(input.folderId));
        }),
      ),
    );

    updateTag("folders");
    updateTag("notes");
  })
  .actionable();
