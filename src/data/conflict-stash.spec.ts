import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";

import { readConflictStash, stashConflict } from "./conflict-stash";

describe("conflict stash", () => {
  afterEach(clearMocks);

  it.each([0, 1_720_000_001_234])(
    "should round trip a conflict timestamp of %i milliseconds",
    async (updatedAt) => {
      const calls: unknown[] = [];
      mockIPC((command, args) => {
        calls.push({ args, command });

        if (command === "read_conflict") {
          return {
            base: { content: "# base", revision: "r1", updatedAt },
            ours: "# mine",
          };
        }

        return null;
      });

      const stash = await readConflictStash("note", "a.md");
      expect(stash).toStrictEqual({
        base: {
          content: "# base",
          revision: "r1",
          updatedAt: new Date(updatedAt),
        },
        ours: "# mine",
      });

      if (stash === null) {
        throw new Error("The conflict stash is missing");
      }

      await stashConflict("note", "a.md", stash);
      expect(calls).toStrictEqual([
        { args: { kind: "note", path: "a.md" }, command: "read_conflict" },
        {
          args: {
            kind: "note",
            path: "a.md",
            stash: {
              base: { content: "# base", revision: "r1", updatedAt },
              ours: "# mine",
            },
          },
          command: "stash_conflict",
        },
      ]);
    }
  );

  it("should return null when no conflict was stored", async () => {
    mockIPC(() => null);
    await expect(readConflictStash("note", "a.md")).resolves.toBeNull();
  });
});
