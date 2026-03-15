"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { authedProcedure } from "@/lib/orpc";
import { AppRuntime } from "@/server/layer";
import { preferencesSchema } from "@/server/schemas/user-schemas";
import { UserService } from "@/server/services/user-service";

export const updatePreferences = authedProcedure
  .input(Schema.standardSchemaV1(preferencesSchema))
  .handler(async ({ context, input }) => {
    await AppRuntime.runPromise(
      UserService.pipe(
        Effect.flatMap((svc) => svc.updatePreferences(context.userId, input)),
      ),
    );

    updateTag("preferences");

    return { message: "preferences updated" };
  })
  .actionable();
