import { QueryClient } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import { getNote } from "@/data/get-note";
import { noteQueries } from "@/data/queries";

afterEach(clearMocks);

describe("saved query boundary", () => {
  it("should use native persisted metadata and preserve missing-file failures", async () => {
    const calls: unknown[] = [];
    mockIPC((command, args) => {
      calls.push({ args, command });
      return {
        content: "# file bytes",
        path: "a.md",
        pinned: true,
        tags: ["z", "a"],
        title: "saved title",
        updatedAt: 1000,
      };
    });
    expect(await getNote("a.md")).toEqual({
      content: "# file bytes",
      path: "a.md",
      pinned: true,
      tags: ["z", "a"],
      title: "saved title",
      updatedAt: new Date(1000),
    });
    expect(calls).toEqual([{ args: { path: "a.md" }, command: "read_note" }]);
    mockIPC(() =>
      Promise.reject({ kind: "not-found", message: "no such file" })
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
    const result = await client.fetchQuery(noteQueries.search(search));
    expect(result[0]).toMatchObject({
      createdAt: new Date(0),
      path: "work/a.md",
      snippet: "[[hl]]needle[[/hl]]",
      updatedAt: new Date(1000),
    });
    expect(calls).toEqual([{ args: { search }, command: "search_notes" }]);
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
          path: "atlas.md",
          pinned: false,
          tags: [],
          title: "Atlas",
          updatedAt: 1000,
        };
      }
      return [];
    });
    await client.fetchQuery(noteQueries.file("note", "atlas.md"));
    await client.fetchQuery(noteQueries.mentions("atlas.md"));
    await client.fetchQuery(noteQueries.tags());
    await client.invalidateQueries({ queryKey: noteQueries.index });
    expect(
      client.getQueryState(noteQueries.mentions("atlas.md").queryKey)
        ?.isInvalidated
    ).toBe(true);
    expect(
      client.getQueryState(noteQueries.tags().queryKey)?.isInvalidated
    ).toBe(true);
    expect(
      client.getQueryState(noteQueries.fileKey("note", "atlas.md"))
        ?.isInvalidated
    ).toBe(false);
    client.clear();
  });
});
