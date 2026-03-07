"use server";

import { Effect } from "effect";

import { serverAction } from "@/lib/authorized";
import { AppRuntime } from "@/server/layer";
import { UserService } from "@/server/services/user-service";

export async function getProfile() {
  return serverAction(async (userId) => {
    return AppRuntime.runPromise(
      UserService.pipe(Effect.flatMap((svc) => svc.getProfile(userId))),
    );
  });
}
