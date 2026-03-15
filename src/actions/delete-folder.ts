"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { toFolderId } from "@/lib/id";
import { authedProcedure } from "@/lib/orpc";
import { AppRuntime } from "@/server/layer";
import { folderIdSchema } from "@/server/schemas/folder-schemas";
import { FolderService } from "@/server/services/folder-service";

export const deleteFolder = authedProcedure
  .input(
    Schema.standardSchemaV1(
      Schema.Struct({
        folderId: folderIdSchema,
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
