import { nativeCommand } from "@/data/native-command";
import { commands, type SaveName } from "@/server/adapters/bindings";

/** Save a complete session document and return its committed path. */
export async function saveNote(
  path: string,
  content: string,
  name: SaveName | null = null
) {
  const receipt = await nativeCommand(() =>
    commands.saveNote(path, content, name)
  );
  return { ...receipt, updatedAt: new Date(receipt.updatedAt) };
}
