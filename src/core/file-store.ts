import type { Effect } from "effect";

import { Context } from "effect";

import type { FileError } from "./errors";

export interface NoteFileContent {
  content: string;
  /** mtime in epoch milliseconds. */
  updatedAt: number;
}

/**
 * Port over the note files on disk. Files are the source of truth; the
 * Tauri adapter backs every operation with a Rust command that also keeps
 * the derived search index in sync, so callers never think about indexing.
 */
export interface IFileStore {
  /** Copy an absolute host path into `attachments/`, returns the relative path. */
  attach(sourcePath: string): Effect.Effect<string, FileError>;
  /** Save base64 image bytes into `attachments/`, returns the relative path. */
  attachImage(base64Data: string): Effect.Effect<string, FileError>;
  delete(path: string): Effect.Effect<void, FileError>;
  exists(path: string): Effect.Effect<boolean, FileError>;
  getNotesDir(): Effect.Effect<string, FileError>;
  read(path: string): Effect.Effect<NoteFileContent, FileError>;
  /** Read a markdown file outside the notes dir (Open With / drag-in). */
  readExternal(path: string): Effect.Effect<NoteFileContent, FileError>;
  reindexAll(): Effect.Effect<string[], FileError>;
  rename(from: string, to: string): Effect.Effect<void, FileError>;
  setNotesDir(path: string): Effect.Effect<void, FileError>;
  /** Write a note file; resolves to the new mtime in epoch milliseconds. */
  write(path: string, content: string): Effect.Effect<number, FileError>;
  writeExternal(
    path: string,
    content: string,
  ): Effect.Effect<number, FileError>;
}

export class FileStore extends Context.Tag("FileStore")<
  FileStore,
  IFileStore
>() {}
