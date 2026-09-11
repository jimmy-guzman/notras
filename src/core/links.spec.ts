import { describe, expect, it } from "vitest";
import queryFixtures from "../../fixtures/note-queries.json";

import { isNotePath, linkResolver } from "./links";
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
});

describe("native resolver parity", () => {
  it("should choose duplicate titles in Unicode scalar path order", () => {
    for (const fixture of queryFixtures.titles) {
      const notes = fixture.notes.map(({ path, title }) => meta(path, title));
      expect(
        linkResolver(notes).title(fixture.target, fixture.from)?.path
      ).toBe(fixture.expected);
      expect(
        linkResolver(notes.toReversed()).title(fixture.target, fixture.from)
          ?.path
      ).toBe(fixture.expected);
    }
  });

  it("should resolve the same percent-encoded paths as Rust", () => {
    for (const fixture of queryFixtures.paths) {
      const notes =
        fixture.expected === null
          ? [
              meta("escape.md"),
              meta("../escape.md"),
              meta("projects/escape.md"),
              meta("projects/../../escape.md"),
            ]
          : [meta(fixture.expected)];
      expect(
        linkResolver(notes).path(fixture.destination, fixture.from)?.path ??
          null
      ).toBe(fixture.expected);
    }
  });
});
