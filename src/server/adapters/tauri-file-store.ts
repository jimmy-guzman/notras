import { invoke } from "@tauri-apps/api/core";
import { Effect, Layer } from "effect";
import { FileError } from "@/core/errors";
import type { IFileStore, NoteFileContent } from "@/core/file-store";
import { FileStore } from "@/core/file-store";

function command<T>(name: string, args?: Record<string, unknown>) {
  return Effect.tryPromise({
    catch: (cause) =>
      new FileError({
        message: typeof cause === "string" ? cause : String(cause),
      }),
    try: () => invoke<T>(name, args),
  });
}

const fileStore: IFileStore = {
  attach: (sourcePath) =>
    command<string>("attach_file", { source: sourcePath }),
  attachImage: (base64Data) => command<string>("attach_image", { base64Data }),
  delete: (path) => command<null>("delete_note", { path }).pipe(Effect.asVoid),
  exists: (path) => command<boolean>("note_exists", { path }),
  getNotesDir: () => command<string>("get_notes_dir"),
  read: (path) => command<NoteFileContent>("read_note", { path }),
  readExternal: (path) => command<NoteFileContent>("read_external", { path }),
  reindexAll: () => command<string[]>("reindex_all"),
  rename: (from, to) =>
    command<null>("rename_note", { from, to }).pipe(Effect.asVoid),
  setNotesDir: (path) =>
    command<null>("set_notes_dir", { path }).pipe(Effect.asVoid),
  write: (path, content) => command<number>("write_note", { content, path }),
  writeExternal: (path, content) =>
    command<number>("write_external", { content, path }),
};

/**
 * Tauri adapter: every operation is a Rust command that also keeps the
 * search index in sync (see `src-tauri/src/notes.rs`).
 */
export const TauriFileStoreLive = Layer.succeed(FileStore, fileStore);
