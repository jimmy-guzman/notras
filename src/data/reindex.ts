import { FileStore } from "@/core/file-store";

import { run } from "./run";

/** Rebuild the derived index from the files on disk. */
export function reindexAll() {
  return run(FileStore.use((store) => store.reindexAll()));
}
