"use server";

import { updateTag } from "next/cache";

import { actionClient } from "@/lib/safe-action";
import { importInputSchema } from "@/server/schemas/export-schemas";
import { getImportService } from "@/server/services/import-service";

export const importNotes = actionClient
  .inputSchema(importInputSchema)
  .action(async ({ ctx: { userId }, parsedInput: { file, mode } }) => {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const result = await getImportService().importZip(userId, buffer, mode);

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
