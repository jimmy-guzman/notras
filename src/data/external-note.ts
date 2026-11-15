import { commands } from "@/server/adapters/bindings";
import type { SaveName } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

/** Read an external Markdown file without adding it to the library index. */
export async function readExternalNote(path: string) {
  return await nativeCommand(async () => await commands.readExternal(path));
}

/** Save the complete external document at the revision it started from; a changed file comes back instead. */
export async function writeExternalNote(
  path: string,
  content: string,
  name: SaveName | null,
  expected: string
) {
  return await nativeCommand(
    async () => await commands.writeExternal(path, content, name, expected)
  );
}
