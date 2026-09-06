import { describe, expect, it } from "vitest";

import { graphOf } from "./graph";
import type { NoteLink } from "./links";
import type { NoteMeta } from "./notes";
import { noteFolder, noteTitle } from "./notes";

function meta(path: string, title = noteTitle(path)): NoteMeta {
  return {
    createdAt: new Date(0),
    folder: noteFolder(path),
    path,
    pinned: false,
    snippet: null,
    tags: [],
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
});
