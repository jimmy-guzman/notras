import { nativeCommand } from "@/data/native-command";
import { commands } from "@/server/adapters/bindings";

interface CreateNoteOptions {
  content?: string;
  folder?: string;
  title?: string;
}

export async function createNote(options?: CreateNoteOptions): Promise<string> {
  const receipt = await nativeCommand(
    async () =>
      await commands.createNote({
        content: options?.content ?? null,
        folder: options?.folder ?? null,
        name:
          options?.title === undefined
            ? null
            : { kind: "title", value: options.title },
      })
  );
  return receipt.path;
}
