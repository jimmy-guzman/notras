import { error as logError } from "@tauri-apps/plugin-log";
import type { Effect, ManagedRuntime } from "effect";
import { Cause, Exit, Option } from "effect";

import { AppRuntime } from "@/server/runtime";

type AppServices = ManagedRuntime.ManagedRuntime.Services<typeof AppRuntime>;

/**
 * Run an Effect on the app runtime, unwrapping a typed failure into the plain
 * `Error` it is so a UI caller can read its message. A defect is a bug rather
 * than a message for anyone: its cause goes to the log and the caller gets a
 * reason that says only that.
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

  try {
    await logError(Cause.pretty(exit.cause));
  } catch {
    // Logging is best effort here: the throw below is what the caller needs.
  }

  throw new Error("an unexpected error");
}
