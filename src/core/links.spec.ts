import { describe, expect, it } from "vitest";

import type { NoteLink } from "./links";
import { mentionsOf, wikilinkResolver } from "./links";
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

describe("wikilinkResolver", () => {
  it("should resolve a title before a filename stem", () => {
    const resolve = wikilinkResolver([
      meta("plan.md", "roadmap"),
      meta("roadmap.md", "q3 notes"),
    ]);

    expect(resolve("roadmap", "index.md")?.path).toBe("plan.md");
  });

  it("should resolve a filename stem when no title matches", () => {
    const resolve = wikilinkResolver([meta("roadmap.md", "q3 notes")]);

    expect(resolve("roadmap", "index.md")?.path).toBe("roadmap.md");
  });

  it("should prefer the note in the linking note's folder", () => {
    const resolve = wikilinkResolver([meta("a/todo.md"), meta("b/todo.md")]);

    expect(resolve("todo", "b/index.md")?.path).toBe("b/todo.md");
  });

  it("should fall back to path order between equal candidates", () => {
    const resolve = wikilinkResolver([meta("z/todo.md"), meta("a/todo.md")]);

    expect(resolve("todo", "index.md")?.path).toBe("a/todo.md");
  });

  it("should ignore case and surrounding space in the target", () => {
    const resolve = wikilinkResolver([meta("todo.md", "Todo List")]);

    expect(resolve("  todo list ", "index.md")?.path).toBe("todo.md");
  });

  it("should resolve nothing for a target no note answers to", () => {
    const resolve = wikilinkResolver([meta("todo.md")]);

    expect(resolve("missing", "index.md")).toBeUndefined();
  });
});

describe("mentionsOf", () => {
  it("should group a note's lines under it", () => {
    const notes = [meta("a.md"), meta("b.md")];
    const links = [link("a.md", "b", 3), link("a.md", "b", 9)];

    expect(mentionsOf("b.md", links, notes)).toEqual([
      {
        lines: [
          { context: "see [[b]]", line: 3, target: "b" },
          { context: "see [[b]]", line: 9, target: "b" },
        ],
        note: notes[0],
      },
    ]);
  });

  it("should leave out a note's links to itself", () => {
    const notes = [meta("a.md")];

    expect(mentionsOf("a.md", [link("a.md", "a")], notes)).toEqual([]);
  });

  it("should leave out a link that resolves to another note", () => {
    const notes = [meta("a.md"), meta("b.md"), meta("c.md")];

    expect(mentionsOf("b.md", [link("a.md", "c")], notes)).toEqual([]);
  });

  it("should leave out a link that resolves nowhere", () => {
    const notes = [meta("a.md"), meta("b.md")];

    expect(mentionsOf("b.md", [link("a.md", "missing")], notes)).toEqual([]);
  });

  it("should resolve each link from its own note's folder", () => {
    const notes = [
      meta("x/todo.md"),
      meta("y/todo.md"),
      meta("x/index.md"),
      meta("y/index.md"),
    ];
    const links = [link("x/index.md", "todo"), link("y/index.md", "todo")];

    expect(
      mentionsOf("x/todo.md", links, notes).map((mention) => mention.note.path)
    ).toEqual(["x/index.md"]);
  });

  it("should list linking notes in path order", () => {
    const notes = [meta("a.md"), meta("b.md"), meta("c.md")];
    const links = [link("c.md", "a"), link("b.md", "a")];

    expect(
      mentionsOf("a.md", links, notes).map((mention) => mention.note.path)
    ).toEqual(["b.md", "c.md"]);
  });

  it("should leave out a link whose note is not in the list yet", () => {
    const notes = [meta("a.md")];

    expect(mentionsOf("a.md", [link("gone.md", "a")], notes)).toEqual([]);
  });
});
