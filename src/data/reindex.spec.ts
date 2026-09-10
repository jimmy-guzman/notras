import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import { reindexAll } from "@/data/reindex";

afterEach(clearMocks);

describe("reindex", () => {
  it("should return the paths affected by rebuilding the index", async () => {
    mockIPC((command) => {
      expect(command).toBe("reindex_all");
      return ["changed.md", "removed.md"];
    });
    await expect(reindexAll()).resolves.toEqual(["changed.md", "removed.md"]);
  });

  it("should reject an incomplete rebuild with its native reason", async () => {
    mockIPC(() =>
      Promise.reject({ kind: "failed", message: "permission denied" })
    );
    await expect(reindexAll()).rejects.toMatchObject({
      kind: "failed",
      message: "permission denied",
    });
  });
});
