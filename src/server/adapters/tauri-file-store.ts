import { invoke } from "@tauri-apps/api/core";
import { Effect, Layer } from "effect";

import type { IFileStore, NoteFileContent } from "@/core";

import { FileError, FileStore } from "@/core";

function command<T>(name: string, args?: Record<string, unknown>) {
  return Effect.tryPromise({
    catch: (cause) => {
      return new FileError({
        message: typeof cause === "string" ? cause : String(cause),
      });
    },
    try: () => {
      return invoke<T>(name, args);
    },
  });
}

const fileStore: IFileStore = {
  attach: (sourcePath) => {
    return command<string>("attach_file", { source: sourcePath });
  },
  attachImage: (base64Data) => {
    return command<string>("attach_image", { base64Data });
  },
  delete: (path) => {
    return command<null>("delete_note", { path }).pipe(Effect.asVoid);
  },
  exists: (path) => {
    return command<boolean>("note_exists", { path });
  },
  getNotesDir: () => {
    return command<string>("get_notes_dir");
  },
  read: (path) => {
    return command<NoteFileContent>("read_note", { path });
  },
  readExternal: (path) => {
    return command<NoteFileContent>("read_external", { path });
  },
  reindexAll: () => {
    return command<string[]>("reindex_all");
  },
  rename: (from, to) => {
    return command<null>("rename_note", { from, to }).pipe(Effect.asVoid);
  },
  setNotesDir: (path) => {
    return command<null>("set_notes_dir", { path }).pipe(Effect.asVoid);
  },
  write: (path, content) => {
    return command<number>("write_note", { content, path });
  },
  writeExternal: (path, content) => {
    return command<number>("write_external", { content, path });
  },
};

/**
 * Tauri adapter: every operation is a Rust command that also keeps the
 * search index in sync (see `src-tauri/src/notes.rs`).
 */
export const TauriFileStoreLive = Layer.succeed(FileStore, fileStore);
