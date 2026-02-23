"use server";

import { revalidatePath } from "next/cache";

import { actionClient } from "@/lib/safe-action";
import { updateProfileSchema } from "@/server/schemas/user-schemas";
import { getUserService } from "@/server/services/user-service";

export const updateProfile = actionClient
  .inputSchema(updateProfileSchema)
  .action(async ({ ctx, parsedInput }) => {
    await getUserService().updateProfile(ctx.userId, parsedInput);

    revalidatePath("/settings");

    return { message: "profile updated" };
  });
