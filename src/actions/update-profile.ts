"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { serverAction } from "@/lib/authorized";
import { updateProfileSchema } from "@/server/schemas/user-schemas";
import { getUserService } from "@/server/services/user-service";

export interface UpdateProfileState {
  errors?: {
    email?: string[];
    name?: string[];
  };
  message?: string;
  success: boolean;
}

export async function updateProfile(
  _prevState: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const result = updateProfileSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
  });

  if (!result.success) {
    const tree = z.treeifyError(result.error);

    return {
      errors: {
        email: tree.properties?.email?.errors,
        name: tree.properties?.name?.errors,
      },
      success: false,
    };
  }

  await serverAction(async (userId) => {
    await getUserService().updateProfile(userId, result.data);
  });

  revalidatePath("/settings");

  return {
    message: "Profile updated",
    success: true,
  };
}
