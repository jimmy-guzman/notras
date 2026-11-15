import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FileError } from "@/core/errors";

import { createNote } from "./create-note";
import { readExternalNote, writeExternalNote } from "./external-note";
import { moveNote } from "./move-note";
import { nativeCommand } from "./native-command";
import { saveNote } from "./save-note";

describe("native command", () => {
  afterEach(clearMocks);

  describe("native command boundary", () => {
    it("should return an external file with its modification date", async () => {
      mockIPC((command, args) => {
        expect(command).toBe("read_external");
        expect(args).toStrictEqual({ path: "/outside/a.md" });

        return { content: "# external", revision: "r1", updatedAt: 0 };
      });

      await expect(readExternalNote("/outside/a.md")).resolves.toStrictEqual({
        content: "# external",
        revision: "r1",
        updatedAt: new Date(0),
      });
    });

    it("should return a moved file with its date and publication warnings", async () => {
      mockIPC((command, args) => {
        expect(command).toBe("move_note");
        expect(args).toStrictEqual({ folder: "work", path: "a.md" });

        return {
          file: { content: "# moved", revision: "r2", updatedAt: 1234 },
          path: "work/a.md",
          remainingSource: null,
          title: null,
          warnings: [
            {
              kind: "index",
              message: "The index is unavailable",
              path: "work/a.md",
            },
          ],
        };
      });

      await expect(moveNote("a.md", "work")).resolves.toStrictEqual({
        file: { content: "# moved", revision: "r2", updatedAt: new Date(1234) },
        path: "work/a.md",
        remainingSource: null,
        title: null,
        warnings: [
          {
            kind: "index",
            message: "The index is unavailable",
            path: "work/a.md",
          },
        ],
      });
    });

    it("should send a title to native creation and return its chosen path", async () => {
      mockIPC((command, args) => {
        expect(command).toBe("create_note");
        expect(args).toStrictEqual({
          options: {
            content: null,
            name: { kind: "title", value: "Q3: planning" },
          },
        });

        return { path: "q3-planning-2.md", updatedAt: 1234, warnings: [] };
      });
      await expect(
        createNote({ title: "Q3: planning" })
      ).resolves.toStrictEqual({
        path: "q3-planning-2.md",
        updatedAt: new Date(1234),
        warnings: [],
      });
    });

    it("should acknowledge a body save even when its committed receipt carries an index warning", async () => {
      mockIPC((command, args) => {
        expect(command).toBe("save_note");
        expect(args).toStrictEqual({
          content: "# saved",
          expected: "r0",
          name: null,
          path: "a.md",
        });

        return {
          kind: "committed",
          receipt: {
            path: "a.md",
            revision: "r1",
            updatedAt: 1_720_000_001_000,
            warnings: [
              { kind: "index", message: "index is unavailable", path: "a.md" },
            ],
          },
        };
      });
      await expect(
        saveNote("a.md", "# saved", null, "r0")
      ).resolves.toStrictEqual({
        kind: "committed",
        receipt: {
          path: "a.md",
          revision: "r1",
          updatedAt: new Date(1_720_000_001_000),
          warnings: [
            { kind: "index", message: "index is unavailable", path: "a.md" },
          ],
        },
      });
    });

    it("should return the filename chosen for a heading edit", async () => {
      mockIPC((command, args) => {
        expect(command).toBe("save_note");
        expect(args).toStrictEqual({
          content: "# Weekend errands",
          expected: "r0",
          name: { kind: "content" },
          path: "shopping.md",
        });

        return {
          kind: "committed",
          receipt: {
            path: "weekend-errands-2.md",
            revision: "r1",
            updatedAt: 1234,
            warnings: [],
          },
        };
      });
      await expect(
        saveNote("shopping.md", "# Weekend errands", { kind: "content" }, "r0")
      ).resolves.toMatchObject({
        receipt: { path: "weekend-errands-2.md", updatedAt: new Date(1234) },
      });
    });

    it("should return the file on disk with a date when a save is refused", async () => {
      mockIPC((command, args) => {
        expect(command).toBe("save_note");
        expect(args).toMatchObject({ expected: "stale" });

        return {
          file: { content: "# on disk", revision: "r9", updatedAt: 1234 },
          kind: "conflict",
        };
      });
      await expect(
        saveNote("a.md", "# mine", null, "stale")
      ).resolves.toStrictEqual({
        file: {
          content: "# on disk",
          revision: "r9",
          updatedAt: new Date(1234),
        },
        kind: "conflict",
      });
    });

    it("should return the file on disk with a date when an external save is refused", async () => {
      mockIPC((command, args) => {
        expect(command).toBe("write_external");
        expect(args).toStrictEqual({
          content: "# mine",
          expected: "stale",
          name: null,
          path: "/outside/a.md",
        });

        return {
          file: { content: "# on disk", revision: "r9", updatedAt: 1234 },
          kind: "conflict",
        };
      });
      await expect(
        writeExternalNote("/outside/a.md", "# mine", null, "stale")
      ).resolves.toStrictEqual({
        file: {
          content: "# on disk",
          revision: "r9",
          updatedAt: new Date(1234),
        },
        kind: "conflict",
      });
    });

    it("should save the whole external file without a library path", async () => {
      mockIPC((command, args) => {
        expect(command).toBe("write_external");
        expect(args).toStrictEqual({
          content: "# external",
          expected: "r0",
          name: null,
          path: "/outside/a.md",
        });

        return {
          kind: "committed",
          receipt: {
            path: "/outside/a.md",
            revision: "r1",
            updatedAt: 1_720_000_002_000,
            warnings: [],
          },
        };
      });
      await expect(
        writeExternalNote("/outside/a.md", "# external", null, "r0")
      ).resolves.toMatchObject({
        receipt: {
          path: "/outside/a.md",
          updatedAt: new Date(1_720_000_002_000),
        },
      });
    });

    it.each(["not-found", "failed"])(
      "should preserve the native %s failure kind",
      async (kind) => {
        const operation = nativeCommand(
          vi
            .fn<() => Promise<never>>()
            .mockRejectedValue({ kind, message: "the reason" })
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
        nativeCommand(
          vi
            .fn<() => Promise<never>>()
            .mockRejectedValue("invalid args for command read_note")
        )
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
      ).rejects.toThrow("An unexpected error");
      expect(logged).toMatchObject([{ command: "plugin:log|log" }]);
      expect(JSON.stringify(logged)).toContain("internal invariant");
    });

    it("should still report an unexpected defect when the log cannot be written", async () => {
      mockIPC((command) => {
        if (command === "plugin:log|log") {
          throw new Error("log sink down");
        }
      });

      await expect(
        nativeCommand(() => {
          throw new Error("internal invariant");
        })
      ).rejects.toThrow("An unexpected error");
    });
  });
});
