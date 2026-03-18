"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { authActionClient } from "@/lib/safe-action";
import { AppRuntime } from "@/server/layer";
import { createFolderSchema } from "@/server/schemas/folder-schemas";
import { FolderService } from "@/server/services/folder-service";

export const createFolder = authActionClient
  .inputSchema(Schema.standardSchemaV1(createFolderSchema))
  .action(async ({ ctx, parsedInput }) => {
    await AppRuntime.runPromise(
      FolderService.pipe(
        Effect.flatMap((svc) => svc.create(ctx.userId, parsedInput.name)),
      ),
    );

    updateTag("folders");
  });
