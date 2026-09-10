import { describe, expect, it } from "vitest";
import type { NoteMeta } from "@/core/notes";
import {
  insertSearchFilter,
  parseSearch,
  searchFolders,
  searchSuggestion,
} from "@/core/search";

function note(path: string, tags: string[] = []): NoteMeta {
  return {
    createdAt: new Date(0),
    folder: path.split("/").slice(0, -1).join("/"),
    path,
    pinned: false,
    snippet: null,
    tags,
    title: path,
    updatedAt: new Date(0),
  };
}

describe("palette search", () => {
  it("should replace the filter at the caret while retaining later filters and text", () => {
    const query = "folder:wo budget #review folder:archive";
    expect(searchSuggestion(query, 9)).toEqual({ kind: "folder", value: "wo" });
    expect(
      insertSearchFilter(query, { kind: "folder", value: "work/2026" }, 9)
    ).toBe("folder:work/2026 budget #review folder:archive");
    expect(searchSuggestion(query, 14)).toBeUndefined();
  });
  it("should prefer the caret token over a later unfinished filter", () => {
    const query = "folder:wo budget folder:";
    expect(searchSuggestion(query, 9)).toEqual({ kind: "folder", value: "wo" });
    expect(
      insertSearchFilter(query, { kind: "folder", value: "work" }, 9)
    ).toBe("folder:work budget folder:");
  });
  it("should combine repeated filters anywhere with free text", () => {
    expect(
      parseSearch("budget #Work folder:work q3 #review folder:work/2026")
    ).toEqual({
      filters: [
        { kind: "tag", value: "work" },
        { kind: "folder", value: "work" },
        { kind: "tag", value: "review" },
        { kind: "folder", value: "work/2026" },
      ],
      incomplete: false,
      query: "budget q3",
    });
  });
  it("should decode quoted spaces and escaped quotes and backslashes", () => {
    expect(
      parseSearch(String.raw`folder:"a \"quote\" \\ b" budget`).filters
    ).toEqual([{ kind: "folder", value: 'a "quote" \\ b' }]);
  });
  it("should distinguish incomplete filters from free text", () => {
    for (const query of ["folder:", 'folder:"work', "#", 'folder:""']) {
      expect(parseSearch(query).incomplete).toBe(true);
    }
    expect(parseSearch("budget")).toEqual({
      filters: [],
      incomplete: false,
      query: "budget",
    });
  });
  it("should replace the suggested token while preserving the rest", () => {
    expect(
      insertSearchFilter("budget #work folder:wo", {
        kind: "folder",
        value: "work/active",
      })
    ).toBe("budget #work folder:work/active ");
    expect(
      insertSearchFilter("folder:work budget #re", {
        kind: "tag",
        value: "review",
      })
    ).toBe("folder:work budget #review ");
    expect(
      insertSearchFilter("#work budget", { kind: "folder", value: 'a "quote"' })
    ).toBe(String.raw`#work budget folder:"a \"quote\"" `);
    expect(searchSuggestion("#work ")).toBeUndefined();
    expect(searchSuggestion("budget folder:wo")).toEqual({
      kind: "folder",
      value: "wo",
    });
  });
  it("should include ancestor folders and count their entire subtree", () => {
    expect(
      searchFolders([
        note("a.md"),
        note("work/2026/b.md"),
        note("work/2026/c.md"),
        note("work/d.md"),
      ])
    ).toEqual([
      { count: 4, folder: "/" },
      { count: 3, folder: "work" },
      { count: 2, folder: "work/2026" },
    ]);
  });
  it("should complete an empty filter before existing text and filters", () => {
    expect(searchSuggestion("folder: budget #work ")).toEqual({
      kind: "folder",
      value: "",
    });
    expect(
      insertSearchFilter("folder: budget #work ", {
        kind: "folder",
        value: "work/active",
      })
    ).toBe("folder:work/active budget #work ");
  });
});

describe("relationship and destination filters", () => {
  it("should preserve quoted phrases and canonical note paths", () => {
    expect(
      parseSearch(
        'budget mention:"Ada Lovelace" to:projects/atlas.md from:inbox/a.md link:github.com'
      ).filters
    ).toEqual([
      { kind: "mention", value: "Ada Lovelace" },
      { kind: "to", value: "projects/atlas.md" },
      { kind: "from", value: "inbox/a.md" },
      { kind: "link", value: "github.com" },
    ]);
    expect(
      insertSearchFilter("folder:work #review from:Atl", {
        kind: "from",
        value: "projects/atlas.md",
      })
    ).toBe("folder:work #review from:projects/atlas.md ");
  });
});
