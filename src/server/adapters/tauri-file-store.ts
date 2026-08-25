import { invoke } from "@tauri-apps/api/core";
import { Effect, Layer, Option, Schema } from "effect";
import { FileError, FileErrorKind } from "@/core/errors";
import type { IFileStore, NoteFileContent } from "@/core/file-store";
import { FileStore } from "@/core/file-store";

/** What a rejecting command sends back (`src-tauri/src/notes.rs`, `D55`). */
const decodeFailure = Schema.decodeUnknownOption(
  Schema.Struct({ kind: FileErrorKind, message: Schema.String })
);

function toFileError(cause: unknown) {
  return Option.match(decodeFailure(cause), {
    // Tauri rejects with a bare string when it fails before reaching the
    // command, and that carries no kind to read.
    onNone: () => new FileError({ kind: "failed", message: String(cause) }),
    onSome: (failure) => new FileError(failure),
  });
}

function command<T>(name: string, args?: Record<string, unknown>) {
  return Effect.tryPromise({
    catch: toFileError,
    try: () => invoke<T>(name, args),
  });
}

const fileStore: IFileStore = {
  attach: (sourcePath) =>
    command<string>("attach_file", { source: sourcePath }),
  attachImage: (base64Data) => command<string>("attach_image", { base64Data }),
  create: (path, content) =>
    command<number>("write_note", { content, create: true, path }),
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
  write: (path, content) =>
    command<number>("write_note", { content, create: false, path }),
  writeExternal: (path, content) =>
    command<number>("write_external", { content, path }),
};

/**
 * Tauri adapter: every operation is a Rust command that also keeps the
 * search index in sync (see `src-tauri/src/notes.rs`).
 */
export const TauriFileStoreLive = Layer.succeed(FileStore, fileStore);
