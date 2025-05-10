"use server";

import invariant from "tiny-invariant";

import { getSession } from "@/lib/auth";

export async function authorizedServerAction<T>(
  action: (userId: string) => Promise<T>,
) {
  const session = await getSession();

  invariant(session, "Unauthorized");

  return action(session.user.id);
}
