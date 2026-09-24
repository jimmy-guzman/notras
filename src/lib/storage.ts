import { error as logError } from "@tauri-apps/plugin-log";
import { parseJson, pipe, safeParse, string } from "valibot";
import type { GenericSchema } from "valibot";

import { toast } from "@/components/ui/toast";
import { reasonOf } from "@/lib/ui/failure";

async function logReadFailure(message: string) {
  try {
    await logError(message);
  } catch {
    // Best effort.
  }
}

/** The saved value, or `undefined` if missing, invalid or unreadable; an unreadable one logs `message`. */
export function readStored<T>(
  key: string,
  schema: GenericSchema<unknown, T>,
  message: string
): T | undefined {
  try {
    const parsed = safeParse(
      pipe(string(), parseJson(), schema),
      localStorage.getItem(key)
    );

    return parsed.success ? parsed.output : undefined;
  } catch (error) {
    void logReadFailure(`${message}: ${reasonOf(error) ?? String(error)}`);
    return undefined;
  }
}

/** Save the value as JSON, or report a failed write in a toast titled `title`. Never throws. */
export function writeStored(
  key: string,
  value: boolean | number | string[],
  title: string
): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    toast.add({ description: reasonOf(error), title, type: "error" });
  }
}
