import { describe, expect, it } from "vitest";
import type { NoteMeta } from "@/core/notes";
import {
  filterSearchNotes,
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
      expect(filterSearchNotes([note("a.md")], parseSearch(query))).toEqual([]);
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
  it("should intersect recursive folders and repeated tags before limiting", () => {
    const notes = [
      ...Array.from({ length: 40 }, (_, i) => note(`other/${i}.md`, ["work"])),
      note("work/a.md", ["work"]),
      note("work/2026/b.md", ["work", "review"]),
      note("workbench/c.md", ["work", "review"]),
    ];
    expect(
      filterSearchNotes(notes, parseSearch("folder:work #work #review")).map(
        ({ path }) => path
      )
    ).toEqual(["work/2026/b.md"]);
    expect(filterSearchNotes(notes, parseSearch("folder:/"))).toHaveLength(30);
    expect(filterSearchNotes(notes, parseSearch("folder:missing"))).toEqual([]);
    expect(filterSearchNotes(notes, parseSearch("#missing"))).toEqual([]);
  });
});
