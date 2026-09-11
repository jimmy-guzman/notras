import { nativeCommand } from "@/data/native-command";
import { commands, type SaveName } from "@/server/adapters/bindings";

/** Read an external Markdown file without adding it to the library index. */
export async function readExternalNote(path: string) {
  const file = await nativeCommand(() => commands.readExternal(path));
  return { content: file.content, updatedAt: new Date(file.updatedAt) };
}

/** Save the complete external document, deriving a filename only for an in-app heading edit. */
export async function writeExternalNote(
  path: string,
  content: string,
  name: SaveName | null = null
) {
  const receipt = await nativeCommand(() =>
    commands.writeExternal(path, content, name)
  );
  return { ...receipt, updatedAt: new Date(receipt.updatedAt) };
}
