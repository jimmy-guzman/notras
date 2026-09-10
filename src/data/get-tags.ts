import { nativeCommand } from "@/data/native-command";
import { commands } from "@/server/adapters/bindings";

export async function getTags() {
  return await nativeCommand(commands.listTags);
}
