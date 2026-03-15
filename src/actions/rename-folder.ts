"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { toFolderId } from "@/lib/id";
import { authedProcedure } from "@/lib/orpc";
import { AppRuntime } from "@/server/layer";
import { renameFolderSchema } from "@/server/schemas/folder-schemas";
import { FolderService } from "@/server/services/folder-service";

export const renameFolder = authedProcedure
  .input(Schema.standardSchemaV1(renameFolderSchema))
  .handler(async ({ context, input }) => {
    await AppRuntime.runPromise(
      FolderService.pipe(
        Effect.flatMap((svc) => {
          return svc.rename(
            context.userId,
            toFolderId(input.folderId),
            input.name,
          );
        }),
      ),
    );

    updateTag("folders");
    updateTag("notes");
  })
  .actionable();
