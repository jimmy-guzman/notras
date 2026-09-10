import { Effect, Layer, Option, Schema } from "effect";
import { FileError, FileErrorKind } from "@/core/errors";
import type { IFileStore } from "@/core/file-store";
import { FileStore } from "@/core/file-store";
import { type CommandError, commands } from "@/server/adapters/bindings";

/** Decode native failures while retaining Tauri's pre-handler string errors. */
const decodeFailure = Schema.decodeUnknownOption(
  Schema.Struct({
    kind: FileErrorKind,
    message: Schema.String,
  }) satisfies Schema.Schema<CommandError>
);

function toFileError(cause: unknown) {
  return Option.match(decodeFailure(cause), {
    // Tauri rejects with a bare string when it fails before reaching the
    // command, and that carries no kind to read.
    onNone: () => new FileError({ kind: "failed", message: String(cause) }),
    onSome: (failure) => new FileError(failure),
  });
}

function command<T>(operation: () => Promise<T>) {
  return Effect.tryPromise({
    catch: toFileError,
    try: operation,
  });
}

const fileStore: IFileStore = {
  getNotesDir: () => command(commands.getNotesDir),
  reindexAll: () => command(commands.reindexAll),
  setNotesDir: (path) =>
    command(() => commands.setNotesDir(path)).pipe(Effect.asVoid),
};

/**
 * Tauri adapter: every operation is a Rust command that also keeps the
 * search index in sync (see `src-tauri/src/notes.rs`).
 */
export const TauriFileStoreLive = Layer.succeed(FileStore, fileStore);
