import { QueryClient } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getNote } from "@/data/get-note";
import { noteQueries } from "@/data/queries";

describe("queries", () => {
  afterEach(clearMocks);

  describe("saved query boundary", () => {
    it("should read file content and revision and preserve missing-file failures", async () => {
      const calls: unknown[] = [];
      mockIPC((command, args) => {
        calls.push({ args, command });
        return {
          content: "# file bytes",
          revision: "r1",
          updatedAt: 1000,
        };
      });
      await expect(getNote("a.md")).resolves.toStrictEqual({
        content: "# file bytes",
        revision: "r1",
        updatedAt: new Date(1000),
      });
      expect(calls).toStrictEqual([
        { args: { path: "a.md" }, command: "read_note" },
      ]);
      mockIPC(
        vi
          .fn<Parameters<typeof mockIPC>[0]>()
          .mockRejectedValue({ kind: "not-found", message: "no such file" })
      );
      await expect(getNote("missing.md")).rejects.toMatchObject({
        kind: "not-found",
        message: "no such file",
      });
    });

    it("should send structured search filters and convert the ranked metadata", async () => {
      const client = new QueryClient();
      const calls: unknown[] = [];
      const search = {
        filters: [{ kind: "tag", value: "work" }],
        incomplete: false,
        query: "needle",
      } satisfies Parameters<typeof noteQueries.search>[0];
      mockIPC((command, args) => {
        calls.push({ args, command });
        return [
          {
            createdAt: 0,
            folder: "work",
            path: "work/a.md",
            pinned: true,
            snippet: "[[hl]]needle[[/hl]]",
            tags: ["work"],
            title: "A",
            updatedAt: 1000,
          },
        ];
      });
      const result = await client.query(noteQueries.search(search));
      expect(result[0]).toMatchObject({
        createdAt: new Date(0),
        path: "work/a.md",
        snippet: "[[hl]]needle[[/hl]]",
        updatedAt: new Date(1000),
      });
      expect(calls).toStrictEqual([
        { args: { search }, command: "search_notes" },
      ]);
      client.clear();
    });

    it("should invalidate saved queries together while leaving direct file reads independent", async () => {
      const client = new QueryClient({
        defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
      });
      mockIPC((command) => {
        if (command === "read_note") {
          return {
            content: "# Atlas",
            revision: "r1",
            updatedAt: 1000,
          };
        }
        return [];
      });
      await client.query(noteQueries.file("note", "atlas.md"));
      await client.query(noteQueries.mentions("atlas.md"));
      await client.query(noteQueries.tags());
      await client.invalidateQueries({ queryKey: noteQueries.index });
      expect(
        client.getQueryState(noteQueries.mentions("atlas.md").queryKey)
          ?.isInvalidated
      ).toBeTruthy();
      expect(
        client.getQueryState(noteQueries.tags().queryKey)?.isInvalidated
      ).toBeTruthy();
      expect(
        client.getQueryState(noteQueries.fileKey("note", "atlas.md"))
          ?.isInvalidated
      ).toBeFalsy();
      client.clear();
    });
  });
});
