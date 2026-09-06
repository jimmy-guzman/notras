import { describe, expect, it } from "vitest";

import { graphOf, hubPill, hubRing } from "./graph";
import type { NoteLink } from "./links";
import type { NoteMeta } from "./notes";
import { noteFolder, noteTitle } from "./notes";

function meta(
  path: string,
  title = noteTitle(path),
  tags: string[] = []
): NoteMeta {
  return {
    createdAt: new Date(0),
    folder: noteFolder(path),
    path,
    pinned: false,
    snippet: null,
    tags,
    title,
    updatedAt: new Date(0),
  };
}

function link(path: string, target: string, line = 1): NoteLink {
  return { context: `see [[${target}]]`, kind: "wikilink", line, path, target };
}

describe("graphOf", () => {
  it("should list the notes a note links to, in document order, each once", () => {
    const notes = [meta("a.md"), meta("b.md"), meta("c.md")];
    const links = [
      link("a.md", "c", 1),
      link("a.md", "b", 2),
      link("a.md", "c", 3),
    ];

    expect(
      graphOf("a.md", links, notes, []).outgoing.map(
        (mention) => mention.note.path
      )
    ).toEqual(["c.md", "b.md"]);
  });

  it("should carry the lines that link an outgoing note", () => {
    const notes = [meta("a.md"), meta("c.md")];
    const links = [link("a.md", "c", 1), link("a.md", "c", 3)];

    expect(graphOf("a.md", links, notes, []).outgoing).toEqual([
      {
        lines: [
          { context: "see [[c]]", line: 1, match: "[[c]]" },
          { context: "see [[c]]", line: 3, match: "[[c]]" },
        ],
        note: notes[1],
      },
    ]);
  });

  it("should list a link that names no note as dangling, once, as written", () => {
    const notes = [meta("a.md")];
    const links = [
      link("a.md", "Missing", 1),
      link("a.md", "Missing", 2),
      link("a.md", "also gone", 3),
    ];
    const graph = graphOf("a.md", links, notes, []);

    expect(graph.dangling).toEqual(["Missing", "also gone"]);
    expect(graph.outgoing).toEqual([]);
  });

  it("should stop listing a target as dangling once its note exists", () => {
    const links = [link("a.md", "missing")];

    expect(graphOf("a.md", links, [meta("a.md")], []).dangling).toEqual([
      "missing",
    ]);
    expect(
      graphOf("a.md", links, [meta("a.md"), meta("missing.md")], []).dangling
    ).toEqual([]);
  });

  it("should not count a note's link to itself as a neighbour", () => {
    const notes = [meta("a.md")];

    expect(graphOf("a.md", [link("a.md", "a")], notes, []).outgoing).toEqual(
      []
    );
  });

  it("should carry the notes that mention it, links and bare titles alike", () => {
    const notes = [meta("a.md"), meta("b.md"), meta("c.md")];
    const links = [link("b.md", "a")];
    const bare = [{ context: "the a note", line: 3, path: "c.md" }];

    expect(
      graphOf("a.md", links, notes, bare).incoming.map(
        (mention) => mention.note.path
      )
    ).toEqual(["b.md", "c.md"]);
  });

  it("should keep a note on both sides", () => {
    const notes = [meta("a.md"), meta("b.md")];
    const links = [link("a.md", "b"), link("b.md", "a")];
    const graph = graphOf("a.md", links, notes, []);

    expect(graph.incoming.map((mention) => mention.note.path)).toEqual([
      "b.md",
    ]);
    expect(graph.outgoing.map((mention) => mention.note.path)).toEqual([
      "b.md",
    ]);
  });

  it("should name a note's folder and then its tags as hubs, with their counts", () => {
    const notes = [
      meta("work/a.md", "a", ["q3", "work"]),
      meta("work/b.md", "b", ["work"]),
      meta("c.md", "c", ["q3"]),
    ];

    expect(graphOf("work/a.md", [], notes, []).hubs).toEqual([
      { count: 2, hub: { folder: "work", kind: "folder" } },
      { count: 2, hub: { kind: "tag", tag: "q3" } },
      { count: 2, hub: { kind: "tag", tag: "work" } },
    ]);
    expect(graphOf("c.md", [], notes, []).hubs).toEqual([
      { count: 2, hub: { kind: "tag", tag: "q3" } },
    ]);
  });

  it("should follow a markdown link the way it follows a wikilink", () => {
    const notes = [meta("work/a.md"), meta("work/b.md")];
    const links = [{ ...link("work/a.md", "b.md"), kind: "link" }];

    expect(
      graphOf("work/a.md", links, notes, []).outgoing.map(
        (mention) => mention.note.path
      )
    ).toEqual(["work/b.md"]);
  });
});

describe("hubRing", () => {
  it("should ring a tag with the notes carrying it, in path order", () => {
    const notes = [
      meta("z.md", "z", ["t"]),
      meta("a.md", "a", ["t"]),
      meta("m.md", "m"),
    ];

    expect(
      hubRing({ kind: "tag", tag: "t" }, notes).map((member) =>
        member.kind === "note" ? member.note.path : member.pill.hub
      )
    ).toEqual(["a.md", "z.md"]);
  });

  it("should ring a folder with the way up, its subfolders, then its notes", () => {
    const notes = [
      meta("work/z.md"),
      meta("work/a.md"),
      meta("work/sub/deep.md"),
      meta("work/other/x.md"),
      meta("root.md"),
    ];

    expect(
      hubRing({ folder: "work/sub", kind: "folder" }, notes).map((member) =>
        member.kind === "note" ? member.note.path : member.pill.hub
      )
    ).toEqual([{ folder: "work", kind: "folder" }, "work/sub/deep.md"]);
    expect(
      hubRing({ folder: "work", kind: "folder" }, notes).map((member) =>
        member.kind === "note" ? member.note.path : member.pill.hub
      )
    ).toEqual([
      { folder: "work/other", kind: "folder" },
      { folder: "work/sub", kind: "folder" },
      "work/a.md",
      "work/z.md",
    ]);
  });

  it("should count a folder's subfolders and notes together", () => {
    const notes = [meta("work/a.md"), meta("work/sub/b.md")];

    expect(hubPill({ folder: "work", kind: "folder" }, notes).count).toBe(2);
  });
});
