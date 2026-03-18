"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { toFolderId } from "@/lib/id";
import { authActionClient } from "@/lib/safe-action";
import { AppRuntime } from "@/server/layer";
import { folderIdSchema } from "@/server/schemas/folder-schemas";
import { FolderService } from "@/server/services/folder-service";

export const deleteFolder = authActionClient
  .inputSchema(
    Schema.standardSchemaV1(
      Schema.Struct({
        folderId: folderIdSchema,
      }),
    ),
  )
  .action(async ({ ctx, parsedInput }) => {
    await AppRuntime.runPromise(
      FolderService.pipe(
        Effect.flatMap((svc) => {
          return svc.delete(ctx.userId, toFolderId(parsedInput.folderId));
        }),
      ),
    );

    updateTag("folders");
    updateTag("notes");
  });
