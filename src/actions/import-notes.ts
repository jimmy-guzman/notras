"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { actionClient } from "@/lib/safe-action";
import { AppRuntime } from "@/server/layer";
import { importInputSchema } from "@/server/schemas/export-schemas";
import { ImportService } from "@/server/services/import-service";

export const importNotes = actionClient
  .inputSchema(Schema.standardSchemaV1(importInputSchema))
  .action(async ({ ctx: { userId }, parsedInput: { file, mode } }) => {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const result = await AppRuntime.runPromise(
      ImportService.pipe(
        Effect.flatMap((svc) => svc.importZip(userId, buffer, mode)),
      ),
    );

    if (!result.success) {
      throw new Error(result.message);
    }

    updateTag("notes");
    updateTag("tags");

    return {
      created: result.created,
      deleted: result.deleted,
      message: result.message,
      skipped: result.skipped,
      updated: result.updated,
    };
  });
