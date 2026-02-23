"use server";

import { getUserService } from "@/server/services/user-service";

export async function serverAction<T>(action: (userId: string) => Promise<T>) {
  const userId = await getUserService().getDeviceUserId();

  return action(userId);
}
