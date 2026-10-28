import { nativeCommand } from "@/data/native-command";
import { saveResult } from "@/data/note-results";
import { commands } from "@/server/adapters/bindings";
import type { SaveName } from "@/server/adapters/bindings";

/** Save a complete document at the revision it started from; a changed file comes back instead. */
export async function saveNote(
  path: string,
  content: string,
  name: SaveName | null,
  expected: string
) {
  return saveResult(
    await nativeCommand(
      async () => await commands.saveNote(path, content, name, expected)
    )
  );
}
