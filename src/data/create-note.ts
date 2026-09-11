import { nativeCommand } from "@/data/native-command";
import { commands, type NoteName } from "@/server/adapters/bindings";

type CreateNoteOptions = {
  content?: string;
  folder?: string;
} & (
  | { filename?: string; title?: never }
  | { filename?: never; title: string }
);

function creationName(options: CreateNoteOptions | undefined): NoteName | null {
  if (options?.title !== undefined) {
    return { kind: "title", value: options.title };
  }
  return options?.filename === undefined
    ? null
    : { kind: "filename", value: options.filename };
}

export async function createNote(options?: CreateNoteOptions): Promise<string> {
  const name = creationName(options);
  const receipt = await nativeCommand(() =>
    commands.createNote({
      content: options?.content ?? null,
      folder: options?.folder ?? null,
      name,
    })
  );
  return receipt.path;
}
