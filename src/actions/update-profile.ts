"use server";

import { Effect, Schema } from "effect";
import { revalidatePath } from "next/cache";

import { authedProcedure } from "@/lib/orpc";
import { AppRuntime } from "@/server/layer";
import { updateProfileSchema } from "@/server/schemas/user-schemas";
import { UserService } from "@/server/services/user-service";

export const updateProfile = authedProcedure
  .input(Schema.standardSchemaV1(updateProfileSchema))
  .handler(async ({ context, input }) => {
    await AppRuntime.runPromise(
      UserService.pipe(
        Effect.flatMap((svc) => svc.updateProfile(context.userId, input)),
      ),
    );

    revalidatePath("/settings");
    revalidatePath("/");

    return { message: "profile updated" };
  })
  .actionable();
