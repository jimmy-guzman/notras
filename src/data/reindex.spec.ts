import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";

import { reindexAll } from "@/data/reindex";

describe("reindex", () => {
  afterEach(clearMocks);

  describe("reindex", () => {
    it("should return the paths affected by rebuilding the index", async () => {
      mockIPC((command) => {
        expect(command).toBe("reindex_all");
        return ["changed.md", "removed.md"];
      });
      await expect(reindexAll()).resolves.toStrictEqual([
        "changed.md",
        "removed.md",
      ]);
    });

    it("should reject an incomplete rebuild with its native reason", async () => {
      mockIPC(
        vi
          .fn<Parameters<typeof mockIPC>[0]>()
          .mockRejectedValue({ kind: "failed", message: "permission denied" })
      );
      await expect(reindexAll()).rejects.toMatchObject({
        kind: "failed",
        message: "permission denied",
      });
    });
  });
});
