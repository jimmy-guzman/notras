import type { Effect } from "effect";

import { Context } from "effect";

import type { FileError } from "./errors";

/** Library settings and rebuilds remaining behind the Effect boundary. */
export interface IFileStore {
  getNotesDir: () => Effect.Effect<string, FileError>;
  reindexAll: () => Effect.Effect<string[], FileError>;
  setNotesDir: (path: string) => Effect.Effect<void, FileError>;
}

export class FileStore extends Context.Service<FileStore, IFileStore>()(
  "notras/core/FileStore"
) {}
