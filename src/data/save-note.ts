import { nativeCommand } from "@/data/native-command";
import { commands, type SaveName } from "@/server/adapters/bindings";

/** Save a complete document at the revision it started from; a changed file comes back instead. */
export async function saveNote(
  path: string,
  content: string,
  name: SaveName | null,
  expected: string
) {
  const outcome = await nativeCommand(() =>
    commands.saveNote(path, content, name, expected)
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
