"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { authedProcedure } from "@/lib/orpc";
import { AppRuntime } from "@/server/layer";
import { createFolderSchema } from "@/server/schemas/folder-schemas";
import { FolderService } from "@/server/services/folder-service";

export const createFolder = authedProcedure
  .input(Schema.standardSchemaV1(createFolderSchema))
  .handler(async ({ context, input }) => {
    await AppRuntime.runPromise(
      FolderService.pipe(
        Effect.flatMap((svc) => svc.create(context.userId, input.name)),
      ),
    );

    updateTag("folders");
  })
  .actionable();
