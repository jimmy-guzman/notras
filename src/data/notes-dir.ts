import { FileStore } from "@/core/file-store";

import { run } from "./run";

export function getNotesDir() {
  return run(FileStore.use((store) => store.getNotesDir()));
}

export function setNotesDir(path: string) {
  return run(FileStore.use((store) => store.setNotesDir(path)));
}
