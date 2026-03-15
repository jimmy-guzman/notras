"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { authedProcedure } from "@/lib/orpc";
import { AppRuntime } from "@/server/layer";
import { importInputSchema } from "@/server/schemas/export-schemas";
import { ImportService } from "@/server/services/import-service";

export const importNotes = authedProcedure
  .input(Schema.standardSchemaV1(importInputSchema))
  .handler(async ({ context, input }) => {
    const buffer = new Uint8Array(await input.file.arrayBuffer());
    const result = await AppRuntime.runPromise(
      ImportService.pipe(
        Effect.flatMap((svc) => {
          return svc.importZip(context.userId, buffer, input.mode);
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
  })
  .actionable();
