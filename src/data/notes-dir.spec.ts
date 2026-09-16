import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FileError } from "@/core/errors";
import { getNotesDir, setNotesDir } from "@/data/notes-dir";

describe("notes dir", () => {
  afterEach(clearMocks);

  describe("library directory commands", () => {
    it("should return the active library directory", async () => {
      mockIPC((command) => {
        expect(command).toBe("get_notes_dir");
        return "/notes";
      });
      await expect(getNotesDir()).resolves.toBe("/notes");
    });

    it("should complete a library change after the native command succeeds", async () => {
      mockIPC((command, args) => {
        expect(command).toBe("set_notes_dir");
        expect(args).toStrictEqual({ path: "/other notes" });
        return null;
      });
      await expect(setNotesDir("/other notes")).resolves.toBeUndefined();
    });

    it.each([
      { kind: "not-found", message: "No such file" },
      { kind: "failed", message: "Permission denied" },
    ])("should preserve a library change failure: $kind", async (failure) => {
      mockIPC(
        vi.fn<Parameters<typeof mockIPC>[0]>().mockRejectedValue(failure)
      );
      const change = setNotesDir("/notes");
      await expect(change).rejects.toBeInstanceOf(FileError);
      await expect(change).rejects.toMatchObject(failure);
    });

    it("should retain a library argument-decoding failure", async () => {
      mockIPC(
        vi
          .fn<Parameters<typeof mockIPC>[0]>()
          .mockRejectedValue("invalid args for command set_notes_dir")
      );
      await expect(setNotesDir("/notes")).rejects.toMatchObject({
        kind: "failed",
        message: "invalid args for command set_notes_dir",
      });
    });
  });
});
