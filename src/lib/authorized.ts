"use server";

import { Effect } from "effect";

import { AppRuntime } from "@/server/layer";
import { UserService } from "@/server/services/user-service";

export async function serverAction<T>(action: (userId: string) => Promise<T>) {
  const userId = await AppRuntime.runPromise(
    Effect.gen(function* () {
      const userService = yield* UserService;

      return yield* userService.getDeviceUserId();
    }),
  );

  return action(userId);
}
