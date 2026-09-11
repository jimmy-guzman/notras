import { nativeCommand } from "@/data/native-command";
import { commands } from "@/server/adapters/bindings";

export async function getNotesDir(): Promise<string> {
  return await nativeCommand(commands.getNotesDir);
}

export async function setNotesDir(path: string): Promise<void> {
  await nativeCommand(() => commands.setNotesDir(path));
}
