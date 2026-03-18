"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { toFolderId } from "@/lib/id";
import { authActionClient } from "@/lib/safe-action";
import { AppRuntime } from "@/server/layer";
import { renameFolderSchema } from "@/server/schemas/folder-schemas";
import { FolderService } from "@/server/services/folder-service";

export const renameFolder = authActionClient
  .inputSchema(Schema.standardSchemaV1(renameFolderSchema))
  .action(async ({ ctx, parsedInput }) => {
    await AppRuntime.runPromise(
      FolderService.pipe(
        Effect.flatMap((svc) => {
          return svc.rename(
            ctx.userId,
            toFolderId(parsedInput.folderId),
            parsedInput.name,
          );
        }),
      ),
    );

    updateTag("folders");
    updateTag("notes");
  });
