import { FileStore } from "@/core/file-store";

import { run } from "./run";

/** Read a markdown file outside the notes dir (Open With / drag-in). */
export function readExternalNote(path: string) {
  return run(FileStore.use((store) => store.readExternal(path)));
}

export function writeExternalNote(path: string, content: string) {
  return run(FileStore.use((store) => store.writeExternal(path, content)));
}
