"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { selectUserSchema, users } from "@/server/db/schemas/users";

const schema = selectUserSchema.pick({ theme: true });

export const updateTheme = async (formData: FormData) => {
  const session = await auth();

  const userId = session?.user?.id;

  if (!userId) {
    throw new Error("No User Found");
  }

  const values = schema.parse({ theme: formData.get("theme") });

  await db.update(users).set(values).where(eq(users.id, userId));

  revalidatePath("/", "layout");
};
