"use server";

import { serverAction } from "@/lib/authorized";
import { getUserService } from "@/server/services/user-service";

export async function getProfile() {
  return serverAction((userId) => getUserService().getProfile(userId));
}
