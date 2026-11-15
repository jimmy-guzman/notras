import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

export async function getNote(path: string) {
  return await nativeCommand(async () => await commands.readNote(path));
}
