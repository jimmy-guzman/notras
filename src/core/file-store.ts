import type { Effect } from "effect";

import { Context } from "effect";

import type { FileError } from "./errors";
import type { BareMention } from "./links";

export interface NoteFileContent {
  content: string;
  /** mtime in epoch milliseconds. */
  updatedAt: number;
}

/** Remaining file reads and library operations behind the Effect boundary. */
export interface IFileStore {
  findMentions: (
    path: string | undefined,
    title: string
  ) => Effect.Effect<BareMention[], FileError>;
  getNotesDir: () => Effect.Effect<string, FileError>;
  read: (path: string) => Effect.Effect<NoteFileContent, FileError>;
  reindexAll: () => Effect.Effect<string[], FileError>;
  setNotesDir: (path: string) => Effect.Effect<void, FileError>;
}

export class FileStore extends Context.Service<FileStore, IFileStore>()(
  "notras/core/FileStore"
) {}
