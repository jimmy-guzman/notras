import { nativeCommand } from "@/data/native-command";
import { commands } from "@/server/adapters/bindings";

export async function getNote(path: string) {
  const note = await nativeCommand(() => commands.readNote(path));
  return { ...note, updatedAt: new Date(note.updatedAt) };
}
