import type { Effect, ManagedRuntime } from "effect";

import { Cause, Exit, Option } from "effect";

import { AppRuntime } from "@/server/runtime";

type AppServices = ManagedRuntime.ManagedRuntime.Services<typeof AppRuntime>;

/**
 * Run an Effect on the app runtime, unwrapping typed failures into plain
 * `Error`s so UI callers get readable `error.message`s instead of a
 * FiberFailure dump.
 */
export async function run<A, E>(
  effect: Effect.Effect<A, E, AppServices>
): Promise<A> {
  const exit = await AppRuntime.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  const failure = Cause.findErrorOption(exit.cause);

  if (Option.isSome(failure) && failure.value instanceof Error) {
    throw failure.value;
  }

  throw new Error(Cause.pretty(exit.cause));
}
