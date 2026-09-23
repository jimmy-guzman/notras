import { nativeCommand } from "@/data/native-command";
import { commands } from "@/server/adapters/bindings";

export async function getFolders() {
  return await nativeCommand(async () => await commands.listFolders());
}
