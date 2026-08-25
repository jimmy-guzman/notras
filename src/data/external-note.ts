import { FileStore } from "@/core/file-store";

import { run } from "./run";

/**
 * Read a markdown file outside the notes dir (Open With / drag-in).
 *
 * The mtime lands as a `Date` so an external tab and a note tab reconcile
 * against disk through the same comparison (`D54`).
 */
export async function readExternalNote(path: string) {
  const file = await run(FileStore.use((store) => store.readExternal(path)));

  return { content: file.content, updatedAt: new Date(file.updatedAt) };
}

export async function writeExternalNote(path: string, content: string) {
  const updatedAt = await run(
    FileStore.use((store) => store.writeExternal(path, content))
  );

  return new Date(updatedAt);
}
