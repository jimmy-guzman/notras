import { describe, expect, it } from "vitest";
import type { NoteMeta } from "@/core/notes";
import {
  filterSearchNotes,
  insertSearchFilter,
  parseSearch,
  searchFilterMatches,
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
  it("should resolve outgoing targets and exclude self links and unresolved destinations", () => {
    const notes = [
      note("projects/atlas.md"),
      note("projects/b.md"),
      note("else/b.md"),
    ].map((meta) => ({
      ...meta,
      title: meta.path.endsWith("b.md") ? "B" : "Atlas",
    }));
    const links = ["B", "Atlas", "missing"].map((target) => ({
      context: `see [[${target}]]`,
      kind: "wikilink",
      line: 1,
      path: "projects/atlas.md",
      target,
    }));
    expect([
      ...searchFilterMatches(
        { kind: "from", value: "projects/atlas.md" },
        notes,
        links,
        []
      ),
    ]).toEqual([["projects/b.md", "Atlas (projects/atlas.md): see [[B]]"]]);
    expect([
      ...searchFilterMatches(
        { kind: "from", value: "absent.md" },
        notes,
        links,
        []
      ),
    ]).toEqual([]);
  });
  it("should combine resolved incoming links with bare mentions", () => {
    const notes = [note("atlas.md"), note("a.md"), note("b.md")].map(
      (meta) => ({
        ...meta,
        title: meta.path === "atlas.md" ? "Atlas" : meta.title,
      })
    );
    const links = [
      {
        context: "see [[Atlas]]",
        kind: "wikilink",
        line: 1,
        path: "a.md",
        target: "Atlas",
      },
      {
        context: "[[Atlas]]",
        kind: "wikilink",
        line: 1,
        path: "atlas.md",
        target: "Atlas",
      },
    ];
    expect([
      ...searchFilterMatches({ kind: "to", value: "atlas.md" }, notes, links, [
        { context: "Atlas here", line: 2, path: "b.md" },
      ]).keys(),
    ]).toEqual(["a.md", "b.md"]);
  });
  it("should match destination text literally without resolving it", () => {
    const links = [
      {
        context: "[code](https://GitHub.com/a)",
        kind: "destination",
        line: 1,
        path: "a.md",
        target: "https://GitHub.com/a",
      },
      {
        context: "[[missing]]",
        kind: "wikilink",
        line: 1,
        path: "b.md",
        target: "missing",
      },
    ];
    expect([
      ...searchFilterMatches(
        { kind: "link", value: "github.com" },
        [],
        links,
        []
      ).keys(),
    ]).toEqual(["a.md"]);
    expect([
      ...searchFilterMatches(
        { kind: "link", value: "missing" },
        [],
        links,
        []
      ).keys(),
    ]).toEqual(["b.md"]);
  });
});
