import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { FileStore } from "@/core/file-store";
import { TauriFileStoreLive } from "@/server/adapters/tauri-file-store";

afterEach(() => {
  clearMocks();
});

describe("Tauri file store", () => {
  it("should preserve a missing-folder failure when changing the library", async () => {
    mockIPC(() =>
      Promise.reject({ kind: "not-found", message: "no such file" })
    );

    const failure = await Effect.runPromise(
      FileStore.use((store) => store.setNotesDir("/missing")).pipe(
        Effect.provide(TauriFileStoreLive),
        Effect.flip
      )
    );

    expect(failure).toMatchObject({
      _tag: "FileError",
      kind: "not-found",
      message: "no such file",
    });
  });

  it("should preserve an expected failure without treating the file as missing", async () => {
    mockIPC(() =>
      Promise.reject({ kind: "failed", message: "permission denied" })
    );

    const failure = await Effect.runPromise(
      FileStore.use((store) => store.setNotesDir("/notes")).pipe(
        Effect.provide(TauriFileStoreLive),
        Effect.flip
      )
    );

    expect(failure).toMatchObject({
      _tag: "FileError",
      kind: "failed",
      message: "permission denied",
    });
  });

  it("should retain Tauri failures that happen before the native handler runs", async () => {
    mockIPC(() => Promise.reject("invalid args for command set_notes_dir"));

    const failure = await Effect.runPromise(
      FileStore.use((store) => store.setNotesDir("/notes")).pipe(
        Effect.provide(TauriFileStoreLive),
        Effect.flip
      )
    );

    expect(failure).toMatchObject({
      _tag: "FileError",
      kind: "failed",
      message: "invalid args for command set_notes_dir",
    });
  });
});
