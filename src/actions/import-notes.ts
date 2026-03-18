"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { authActionClient } from "@/lib/safe-action";
import { AppRuntime } from "@/server/layer";
import { importInputSchema } from "@/server/schemas/export-schemas";
import { ImportService } from "@/server/services/import-service";

export const importNotes = authActionClient
  .inputSchema(Schema.standardSchemaV1(importInputSchema))
  .action(async ({ ctx, parsedInput }) => {
    const buffer = new Uint8Array(await parsedInput.file.arrayBuffer());
    const result = await AppRuntime.runPromise(
      ImportService.pipe(
        Effect.flatMap((svc) => {
          return svc.importZip(ctx.userId, buffer, parsedInput.mode);
        }),
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
