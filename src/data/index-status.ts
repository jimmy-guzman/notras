import { nativeCommand } from "@/data/native-command";
import { commands, type IndexStatus } from "@/server/adapters/bindings";

export async function getIndexStatus(): Promise<IndexStatus> {
  return await nativeCommand(commands.indexStatus);
}
