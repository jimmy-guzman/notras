import { FileStore } from "@/core";

import { run } from "./run";

export async function getNotesDir() {
  return run(FileStore.use((store) => store.getNotesDir()));
}

export async function setNotesDir(path: string) {
  return run(FileStore.use((store) => store.setNotesDir(path)));
}
