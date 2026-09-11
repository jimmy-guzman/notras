import { nativeCommand } from "@/data/native-command";
import { commands } from "@/server/adapters/bindings";

export async function deleteNote(path: string): Promise<void> {
  await nativeCommand(() => commands.deleteNote(path));
}
