import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import { FileError } from "@/core/errors";
import { createNote } from "@/data/create-note";
import { writeExternalNote } from "@/data/external-note";
import { nativeCommand } from "@/data/native-command";
import { saveNote } from "@/data/save-note";

afterEach(clearMocks);

describe("native command boundary", () => {
  it("should send a title to native creation and return its chosen path", async () => {
    mockIPC((command, args) => {
      expect(command).toBe("create_note");
      expect(args).toEqual({
        options: {
          content: null,
          folder: null,
          name: { kind: "title", value: "Q3: planning" },
        },
      });
      return { path: "q3-planning-2.md", updatedAt: 1234, warnings: [] };
    });
    await expect(createNote({ title: "Q3: planning" })).resolves.toBe(
      "q3-planning-2.md"
    );
  });

  it("should acknowledge a body save even when its committed receipt carries an index warning", async () => {
    mockIPC((command, args) => {
      expect(command).toBe("save_note");
      expect(args).toEqual({
        content: "# saved",
        name: null,
        path: "a.md",
      });
      return {
        path: "a.md",
        updatedAt: 1_720_000_001_000,
        warnings: [
          { kind: "index", message: "index is unavailable", path: "a.md" },
        ],
      };
    });
    await expect(saveNote("a.md", "# saved")).resolves.toMatchObject({
      path: "a.md",
      updatedAt: new Date(1_720_000_001_000),
    });
  });

  it("should return the filename chosen for a heading edit", async () => {
    mockIPC((command, args) => {
      expect(command).toBe("save_note");
      expect(args).toEqual({
        content: "# Weekend errands",
        name: { kind: "heading" },
        path: "shopping.md",
      });
      return { path: "weekend-errands-2.md", updatedAt: 1234, warnings: [] };
    });
    await expect(
      saveNote("shopping.md", "# Weekend errands", { kind: "heading" })
    ).resolves.toMatchObject({
      path: "weekend-errands-2.md",
      updatedAt: new Date(1234),
    });
  });

  it("should save the whole external file without a library path", async () => {
    mockIPC((command, args) => {
      expect(command).toBe("write_external");
      expect(args).toEqual({
        content: "# external",
        name: null,
        path: "/outside/a.md",
      });
      return {
        path: "/outside/a.md",
        updatedAt: 1_720_000_002_000,
        warnings: [],
      };
    });
    await expect(
      writeExternalNote("/outside/a.md", "# external")
    ).resolves.toMatchObject({
      path: "/outside/a.md",
      updatedAt: new Date(1_720_000_002_000),
    });
  });

  it.each(["not-found", "failed"])(
    "should preserve the native %s failure kind",
    async (kind) => {
      const operation = nativeCommand(() =>
        Promise.reject({ kind, message: "the reason" })
      );
      await expect(operation).rejects.toBeInstanceOf(FileError);
      await expect(operation).rejects.toMatchObject({
        kind,
        message: "the reason",
      });
    }
  );

  it("should retain a Tauri argument-decoding failure", async () => {
    await expect(
      nativeCommand(() => Promise.reject("invalid args for command read_note"))
    ).rejects.toMatchObject({
      kind: "failed",
      message: "invalid args for command read_note",
    });
  });

  it("should report an unexpected defect without exposing its internals", async () => {
    const logged: unknown[] = [];
    mockIPC((command, args) => {
      logged.push({ args, command });
    });
    await expect(
      nativeCommand(() => {
        throw new Error("internal invariant");
      })
    ).rejects.toThrow("an unexpected error");
    expect(logged).toEqual([
      {
        args: expect.objectContaining({
          message: expect.stringContaining("internal invariant"),
        }),
        command: "plugin:log|log",
      },
    ]);
  });
});
