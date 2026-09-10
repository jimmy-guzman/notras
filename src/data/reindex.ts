import { nativeCommand } from "@/data/native-command";
import { commands } from "@/server/adapters/bindings";

/** Rebuild the derived index from the files on disk. */
export async function reindexAll(): Promise<string[]> {
  return await nativeCommand(commands.reindexAll);
}
