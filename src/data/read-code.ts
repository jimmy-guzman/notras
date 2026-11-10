import { commands } from "@/server/adapters/bindings";
import type { CodeFile } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

/** Read a code file at an absolute path whole. Answers null when it still stands at `known`. */
export async function readCodeIfMoved(
  path: string,
  known: string | null
): Promise<CodeFile | null> {
  return await nativeCommand(
    async () => await commands.readCodeIfMoved(path, known)
  );
}
