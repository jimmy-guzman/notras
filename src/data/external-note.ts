import { nativeCommand } from "@/data/native-command";
import { saveResult } from "@/data/note-results";
import { commands } from "@/server/adapters/bindings";
import type { SaveName } from "@/server/adapters/bindings";

/** Read an external Markdown file without adding it to the library index. */
export async function readExternalNote(path: string) {
  const file = await nativeCommand(
    async () => await commands.readExternal(path)
  );

  return {
    content: file.content,
    revision: file.revision,
    updatedAt: new Date(file.updatedAt),
  };
}

/** Save the complete external document at the revision it started from; a changed file comes back instead. */
export async function writeExternalNote(
  path: string,
  content: string,
  name: SaveName | null,
  expected: string
) {
  return saveResult(
    await nativeCommand(
      async () => await commands.writeExternal(path, content, name, expected)
    )
  );
}
