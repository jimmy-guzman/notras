import { Effect } from "effect";

import { FileStore } from "@/core";

import { run } from "./run";

export async function getNotesDir() {
  return run(
    FileStore.pipe(
      Effect.flatMap((store) => {
        return store.getNotesDir();
      }),
    ),
  );
}

export async function setNotesDir(path: string) {
  return run(
    FileStore.pipe(
      Effect.flatMap((store) => {
        return store.setNotesDir(path);
      }),
    ),
  );
}

export async function reindexAll() {
  return run(
    FileStore.pipe(
      Effect.flatMap((store) => {
        return store.reindexAll();
      }),
    ),
  );
}
