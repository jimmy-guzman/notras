"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { authActionClient } from "@/lib/safe-action";
import { AppRuntime } from "@/server/layer";
import { preferencesSchema } from "@/server/schemas/user-schemas";
import { UserService } from "@/server/services/user-service";

export const updatePreferences = authActionClient
  .inputSchema(Schema.standardSchemaV1(preferencesSchema))
  .action(async ({ ctx, parsedInput }) => {
    await AppRuntime.runPromise(
      UserService.pipe(
        Effect.flatMap((svc) => svc.updatePreferences(ctx.userId, parsedInput)),
      ),
    );

    updateTag("preferences");

    return { message: "preferences updated" };
  });
