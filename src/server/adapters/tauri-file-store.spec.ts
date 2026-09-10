import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { FileStore } from "@/core/file-store";
import { TauriFileStoreLive } from "@/server/adapters/tauri-file-store";

afterEach(() => {
  clearMocks();
});

describe("Tauri file store", () => {
  it("should return the committed timestamp when creating a note", async () => {
    mockIPC((command, args) => {
      expect(command).toBe("write_note");
      expect(args).toEqual({ content: "# first", create: true, path: "a.md" });
      return { path: "a.md", updatedAt: 1_720_000_000_000 };
    });

    const timestamp = await Effect.runPromise(
      FileStore.use((store) => store.create("a.md", "# first")).pipe(
        Effect.provide(TauriFileStoreLive)
      )
    );

    expect(timestamp).toBe(1_720_000_000_000);
  });

  it("should return the committed timestamp when saving an existing note", async () => {
    mockIPC((command, args) => {
      expect(command).toBe("write_note");
      expect(args).toEqual({ content: "# saved", create: false, path: "a.md" });
      return { path: "a.md", updatedAt: 1_720_000_001_000 };
    });

    const timestamp = await Effect.runPromise(
      FileStore.use((store) => store.write("a.md", "# saved")).pipe(
        Effect.provide(TauriFileStoreLive)
      )
    );

    expect(timestamp).toBe(1_720_000_001_000);
  });

  it("should return the committed timestamp when saving an external file", async () => {
    mockIPC((command, args) => {
      expect(command).toBe("write_external");
      expect(args).toEqual({ content: "# external", path: "/outside/a.md" });
      return { path: "/outside/a.md", updatedAt: 1_720_000_002_000 };
    });

    const timestamp = await Effect.runPromise(
      FileStore.use((store) =>
        store.writeExternal("/outside/a.md", "# external")
      ).pipe(Effect.provide(TauriFileStoreLive))
    );

    expect(timestamp).toBe(1_720_000_002_000);
  });

  it("should preserve a missing-file failure for callers that keep unsaved text", async () => {
    mockIPC(() =>
      Promise.reject({ kind: "not-found", message: "no such file" })
    );

    const failure = await Effect.runPromise(
      FileStore.use((store) => store.read("missing.md")).pipe(
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
      FileStore.use((store) => store.write("a.md", "unsaved")).pipe(
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
    mockIPC(() => Promise.reject("invalid args for command read_note"));

    const failure = await Effect.runPromise(
      FileStore.use((store) => store.read("a.md")).pipe(
        Effect.provide(TauriFileStoreLive),
        Effect.flip
      )
    );

    expect(failure).toMatchObject({
      _tag: "FileError",
      kind: "failed",
      message: "invalid args for command read_note",
    });
  });
});
