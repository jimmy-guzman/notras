import { Effect } from "effect";

import { FileStore } from "@/core";

import { run } from "./run";

/** Read a markdown file outside the notes dir (Open With / drag-in). */
export async function readExternalNote(path: string) {
  return run(
    FileStore.pipe(
      Effect.flatMap((store) => {
        return store.readExternal(path);
      }),
    ),
  );
}

export async function writeExternalNote(path: string, content: string) {
  return run(
    FileStore.pipe(
      Effect.flatMap((store) => {
        return store.writeExternal(path, content);
      }),
    ),
  );
}
