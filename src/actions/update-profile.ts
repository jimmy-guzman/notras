"use server";

import { Effect, Schema } from "effect";
import { revalidatePath } from "next/cache";

import { authActionClient } from "@/lib/safe-action";
import { AppRuntime } from "@/server/layer";
import { updateProfileSchema } from "@/server/schemas/user-schemas";
import { UserService } from "@/server/services/user-service";

export const updateProfile = authActionClient
  .inputSchema(Schema.standardSchemaV1(updateProfileSchema))
  .action(async ({ ctx, parsedInput }) => {
    await AppRuntime.runPromise(
      UserService.pipe(
        Effect.flatMap((svc) => svc.updateProfile(ctx.userId, parsedInput)),
      ),
    );

    revalidatePath("/settings");
    revalidatePath("/");

    return { message: "profile updated" };
  });
