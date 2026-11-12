import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

/** Rebuild the derived index from the files on disk. */
export async function reindexAll(): Promise<string[]> {
  return await nativeCommand(async () => await commands.reindexAll());
}
