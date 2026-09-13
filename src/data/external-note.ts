import { nativeCommand } from "@/data/native-command";
import { commands, type SaveName } from "@/server/adapters/bindings";

/** Read an external Markdown file without adding it to the library index. */
export async function readExternalNote(path: string) {
  const file = await nativeCommand(() => commands.readExternal(path));
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
  const outcome = await nativeCommand(() =>
    commands.writeExternal(path, content, name, expected)
  );
  return outcome.kind === "committed"
    ? {
        kind: outcome.kind,
        receipt: {
          ...outcome.receipt,
          updatedAt: new Date(outcome.receipt.updatedAt),
        },
      }
    : {
        file: { ...outcome.file, updatedAt: new Date(outcome.file.updatedAt) },
        kind: outcome.kind,
      };
}
