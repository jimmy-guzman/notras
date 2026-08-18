import { FileStore } from "@/core";

import { run } from "./run";

/** Rebuild the derived index from the files on disk. */
export async function reindexAll() {
  return run(FileStore.use((store) => store.reindexAll()));
}
