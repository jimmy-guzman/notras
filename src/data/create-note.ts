import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

interface CreateNoteOptions {
  content?: string;
  title?: string;
}

export async function createNote(options?: CreateNoteOptions) {
  return await nativeCommand(
    async () =>
      await commands.createNote({
        content: options?.content ?? null,
        name:
          options?.title === undefined
            ? null
            : { kind: "title", value: options.title },
      })
  );
}
