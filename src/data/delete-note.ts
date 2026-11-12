import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

export async function deleteNote(path: string): Promise<void> {
  await nativeCommand(async () => await commands.deleteNote(path));
}
