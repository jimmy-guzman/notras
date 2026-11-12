import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

export async function getNote(path: string) {
  const note = await nativeCommand(async () => await commands.readNote(path));

  return { ...note, updatedAt: new Date(note.updatedAt) };
}
