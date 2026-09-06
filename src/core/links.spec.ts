import { describe, expect, it } from "vitest";

import type { NoteLink } from "./links";
import { isNotePath, linkResolver, mentionsOf } from "./links";
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

describe("linkResolver, by title", () => {
  it("should resolve a title before a filename stem", () => {
    const resolve = linkResolver([
      meta("plan.md", "roadmap"),
      meta("roadmap.md", "q3 notes"),
    ]);

    expect(resolve.title("roadmap", "index.md")?.path).toBe("plan.md");
  });

  it("should resolve a filename stem when no title matches", () => {
    const resolve = linkResolver([meta("roadmap.md", "q3 notes")]);

    expect(resolve.title("roadmap", "index.md")?.path).toBe("roadmap.md");
  });

  it("should prefer the note in the linking note's folder", () => {
    const resolve = linkResolver([meta("a/todo.md"), meta("b/todo.md")]);

    expect(resolve.title("todo", "b/index.md")?.path).toBe("b/todo.md");
  });

  it("should fall back to path order between equal candidates", () => {
    const resolve = linkResolver([meta("z/todo.md"), meta("a/todo.md")]);

    expect(resolve.title("todo", "index.md")?.path).toBe("a/todo.md");
  });

  it("should ignore case and surrounding space in the target", () => {
    const resolve = linkResolver([meta("todo.md", "Todo List")]);

    expect(resolve.title("  todo list ", "index.md")?.path).toBe("todo.md");
  });

  it("should resolve nothing for a target no note answers to", () => {
    const resolve = linkResolver([meta("todo.md")]);

    expect(resolve.title("missing", "index.md")).toBeUndefined();
  });
});

describe("isNotePath", () => {
  it("should accept a relative markdown destination and nothing else", () => {
    for (const yes of [
      "b.md",
      "./b.md",
      "../b.md",
      "sub/b%20c.md",
      "B.MD",
      "b.markdown",
      "b.md#h",
      "b.md?x=1",
      "b.MD.md",
    ]) {
      expect(isNotePath(yes), yes).toBe(true);
    }
    for (const no of [
      "http://x/b.md",
      "mailto:x@y.z",
      "file:///b.md",
      "#h",
      "/abs/b.md",
      "b.txt",
      "b.md.txt",
      ".md",
      ".hidden.md",
    ]) {
      expect(isNotePath(no), no).toBe(false);
    }
  });
});

describe("linkResolver, by path", () => {
  it("should join a destination to the linking note's folder", () => {
    const resolve = linkResolver([meta("work/b.md"), meta("b.md")]);

    expect(resolve.path("b.md", "work/a.md")?.path).toBe("work/b.md");
    expect(resolve.path("../b.md", "work/a.md")?.path).toBe("b.md");
    expect(resolve.path("./b.md", "a.md")?.path).toBe("b.md");
    expect(resolve.path("work/../b.md", "a.md")?.path).toBe("b.md");
  });

  it("should decode the destination and drop a fragment or query", () => {
    const resolve = linkResolver([meta("sub/b c.md")]);

    expect(resolve.path("sub/b%20c.md#h", "a.md")?.path).toBe("sub/b c.md");
    expect(resolve.path("sub/b%20c.md?x=1", "a.md")?.path).toBe("sub/b c.md");
  });

  it("should match without regard to case when nothing matches exactly", () => {
    const resolve = linkResolver([meta("Notes/Todo.md")]);

    expect(resolve.path("notes/todo.md", "a.md")?.path).toBe("Notes/Todo.md");
  });

  it("should refuse a destination that climbs above the root", () => {
    const resolve = linkResolver([meta("b.md")]);

    expect(resolve.path("../b.md", "a.md")).toBeUndefined();
  });

  it("should dispatch a row by its kind", () => {
    const resolve = linkResolver([
      meta("plan.md", "roadmap"),
      meta("roadmap.md", "other"),
    ]);

    expect(resolve.row(link("a.md", "roadmap"))?.path).toBe("plan.md");
    expect(
      resolve.row({ ...link("a.md", "roadmap.md"), kind: "link" })?.path
    ).toBe("roadmap.md");
  });
});

describe("mentionsOf", () => {
  it("should count a markdown link to the note, windowed on its destination", () => {
    const notes = [meta("a.md"), meta("b.md")];
    const links = [
      {
        ...link("a.md", "b.md", 4),
        context: "see [there](b.md)",
        kind: "link",
      },
    ];

    expect(mentionsOf("b.md", links, notes, [])).toEqual([
      {
        lines: [{ context: "see [there](b.md)", line: 4, match: "b.md" }],
        note: notes[0],
      },
    ]);
  });

  it("should group a note's lines under it", () => {
    const notes = [meta("a.md"), meta("b.md")];
    const links = [link("a.md", "b", 3), link("a.md", "b", 9)];

    expect(mentionsOf("b.md", links, notes, [])).toEqual([
      {
        lines: [
          { context: "see [[b]]", line: 3, match: "[[b]]" },
          { context: "see [[b]]", line: 9, match: "[[b]]" },
        ],
        note: notes[0],
      },
    ]);
  });

  it("should leave out a note's links to itself", () => {
    const notes = [meta("a.md")];

    expect(mentionsOf("a.md", [link("a.md", "a")], notes, [])).toEqual([]);
  });

  it("should leave out a link that resolves to another note", () => {
    const notes = [meta("a.md"), meta("b.md"), meta("c.md")];

    expect(mentionsOf("b.md", [link("a.md", "c")], notes, [])).toEqual([]);
  });

  it("should leave out a link that resolves nowhere", () => {
    const notes = [meta("a.md"), meta("b.md")];

    expect(mentionsOf("b.md", [link("a.md", "missing")], notes, [])).toEqual(
      []
    );
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
      mentionsOf("x/todo.md", links, notes, []).map(
        (mention) => mention.note.path
      )
    ).toEqual(["x/index.md"]);
  });

  it("should list linking notes in path order", () => {
    const notes = [meta("a.md"), meta("b.md"), meta("c.md")];
    const links = [link("c.md", "a"), link("b.md", "a")];

    expect(
      mentionsOf("a.md", links, notes, []).map((mention) => mention.note.path)
    ).toEqual(["b.md", "c.md"]);
  });

  it("should leave out a link whose note is not in the list yet", () => {
    const notes = [meta("a.md")];

    expect(mentionsOf("a.md", [link("gone.md", "a")], notes, [])).toEqual([]);
  });

  it("should count a note that writes the title bare", () => {
    const notes = [meta("a.md"), meta("b.md", "graph view")];
    const bare = [{ context: "the graph view is next", line: 2, path: "a.md" }];

    expect(mentionsOf("b.md", [], notes, bare)).toEqual([
      {
        lines: [
          { context: "the graph view is next", line: 2, match: "graph view" },
        ],
        note: notes[0],
      },
    ]);
  });

  it("should merge a note's link and its bare line in line order", () => {
    const notes = [meta("a.md"), meta("b.md", "graph view")];
    const bare = [{ context: "the graph view is next", line: 2, path: "a.md" }];

    expect(
      mentionsOf("b.md", [link("a.md", "graph view", 5)], notes, bare)
    ).toEqual([
      {
        lines: [
          { context: "the graph view is next", line: 2, match: "graph view" },
          { context: "see [[graph view]]", line: 5, match: "[[graph view]]" },
        ],
        note: notes[0],
      },
    ]);
  });
});
