import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

export async function moveNote(path: string, folder: string) {
  return await nativeCommand(async () => await commands.moveNote(path, folder));
}
