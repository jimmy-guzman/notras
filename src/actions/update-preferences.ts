"use server";

import { updateTag } from "next/cache";

import { actionClient } from "@/lib/safe-action";
import { preferencesSchema } from "@/server/schemas/user-schemas";
import { getUserService } from "@/server/services/user-service";

export const updatePreferences = actionClient
  .inputSchema(preferencesSchema)
  .action(async ({ ctx, parsedInput }) => {
    await getUserService().updatePreferences(ctx.userId, parsedInput);

    updateTag("preferences");

    return { message: "preferences updated" };
  });
