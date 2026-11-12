import queryFixtures from "@fixtures/note-queries.json";
import { describe, expect, it } from "vitest";

import {
  contextFrom,
  foldPath,
  isCsvPath,
  isNotePath,
  isRelativeDestination,
  linkResolver,
  resolveImage,
} from "./links";
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

describe(resolveImage, () => {
  it("should find an image by its filename in any folder", () => {
    expect(resolveImage(["attachments/photo.png"], "photo.png", "a.md")).toBe(
      "attachments/photo.png"
    );
  });

  it("should prefer the image in the note's own folder", () => {
    const images = ["a/photo.png", "b/photo.png"];

    expect(resolveImage(images, "photo.png", "b/note.md")).toBe("b/photo.png");
  });

  it("should settle a tie elsewhere by path order", () => {
    const images = ["z/photo.png", "a/photo.png"];

    expect(resolveImage(images, "photo.png", "note.md")).toBe("a/photo.png");
  });

  it("should ignore case and the space around the name", () => {
    expect(resolveImage(["img/Photo.PNG"], " photo.png ", "a.md")).toBe(
      "img/Photo.PNG"
    );
  });

  it("should find a screenshot whose name holds a space a person cannot type", () => {
    const screenshot = "attachments/Screenshot at 7.00.51 AM.png";

    expect(
      resolveImage([screenshot], "Screenshot at 7.00.51 AM.png", "a.md")
    ).toBe(screenshot);
  });

  it("should match a path on its last segments", () => {
    const images = ["a/photo.png", "trips/img/photo.png"];

    expect(resolveImage(images, "img/photo.png", "a/note.md")).toBe(
      "trips/img/photo.png"
    );
  });

  it("should not match the tail of a longer filename", () => {
    expect(resolveImage(["my-photo.png"], "photo.png", "a.md")).toBeUndefined();
  });
});

describe(isNotePath, () => {
  it.each([
    "b.md",
    "./b.md",
    "../b.md",
    "sub/b%20c.md",
    "B.MD",
    "b.markdown",
    "b.md#h",
    "b.md?x=1",
    "b.MD.md",
  ])("should accept %s as a relative markdown destination", (yes) => {
    expect(isNotePath(yes)).toBeTruthy();
  });

  it.each([
    "http://x/b.md",
    "mailto:x@y.z",
    "file:///b.md",
    "#h",
    "/abs/b.md",
    "b.txt",
    "b.md.txt",
    ".md",
    ".hidden.md",
  ])("should reject %s as a relative markdown destination", (no) => {
    expect(isNotePath(no)).toBeFalsy();
  });
});

describe(isCsvPath, () => {
  it.each(["data.csv", "./data.CSV", "../x/data.tsv", "data.csv#top"])(
    "should accept %s as a relative csv destination",
    (yes) => {
      expect(isCsvPath(yes)).toBeTruthy();
    }
  );

  it.each(["/abs/data.csv", "https://x/data.csv", "data.csv.md", "data.txt"])(
    "should refuse %s",
    (no) => {
      expect(isCsvPath(no)).toBeFalsy();
    }
  );
});

describe(isRelativeDestination, () => {
  it.each([
    "spec.pdf",
    "./spec.pdf",
    "../docs/my%20spec.pdf",
    "attachments/notes.pdf",
    "b.md",
  ])("should accept %s as a path beside the note", (yes) => {
    expect(isRelativeDestination(yes)).toBeTruthy();
  });

  it.each([
    "https://x/spec.pdf",
    "mailto:x@y.z",
    "data:image/png;base64,AA==",
    "#h",
    "/abs/spec.pdf",
  ])("should reject %s as a path beside the note", (no) => {
    expect(isRelativeDestination(no)).toBeFalsy();
  });
});

describe(foldPath, () => {
  it("should fold a decoded path onto the note's folder", () => {
    expect(foldPath("../docs/my spec.pdf", "projects/a.md")).toStrictEqual({
      path: "docs/my spec.pdf",
    });
    expect(foldPath("./shot.png", "a.md")).toStrictEqual({ path: "shot.png" });
    expect(foldPath("attachments/x.png", "projects/a.md")).toStrictEqual({
      path: "projects/attachments/x.png",
    });
  });

  it("should refuse a path that climbs above the root", () => {
    expect(foldPath("../x.png", "a.md")).toStrictEqual({ refused: "climb" });
  });

  it("should refuse a segment the library refuses", () => {
    expect(foldPath("..\\..\\secret.png", "projects/a.md")).toStrictEqual({
      refused: "segment",
    });
    expect(foldPath("c:/secret.png", "a.md")).toStrictEqual({
      refused: "segment",
    });
    expect(foldPath(".private.png", "a.md")).toStrictEqual({
      refused: "segment",
    });
    expect(foldPath(".hidden/x.png", "a.md")).toStrictEqual({
      refused: "segment",
    });
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

describe(contextFrom, () => {
  it("should keep a line whose link sits near its start", () => {
    expect(contextFrom({ at: 4, context: "see here first" })).toBe(
      "see here first"
    );
  });

  it("should start the line a little before its link", () => {
    const padding = "word ".repeat(20);

    expect(
      contextFrom({ at: padding.length, context: `${padding}here at the end` })
    ).toBe("…word word word word word word here at the end");
  });

  it("should keep an emoji whole when the line starts inside it", () => {
    const lead = `aaaaaaa😀${"b".repeat(31)}`;

    expect(contextFrom({ at: lead.length, context: `${lead}here` })).toBe(
      `…😀${"b".repeat(31)}here`
    );
  });

  it("should keep a flag whole when the line starts inside it", () => {
    const lead = `aaaaaaa🇺🇸${"b".repeat(30)}`;

    expect(contextFrom({ at: lead.length, context: `${lead}here` })).toBe(
      `…🇺🇸${"b".repeat(30)}here`
    );
  });

  it("should keep a joined emoji whole when the line starts inside it", () => {
    const lead = `aaaaaaa👩‍💻${"b".repeat(29)}`;

    expect(contextFrom({ at: lead.length, context: `${lead}here` })).toBe(
      `…👩‍💻${"b".repeat(29)}here`
    );
  });

  it("should drop the ellipsis when the whole character opens the line", () => {
    const lead = `😀${"b".repeat(31)}`;

    expect(contextFrom({ at: lead.length, context: `${lead}here` })).toBe(
      `${lead}here`
    );
  });

  it("should keep an accent whole when the line starts after a space", () => {
    const lead = `${"a".repeat(15)} ́${"b".repeat(28)}`;

    expect(contextFrom({ at: lead.length, context: `${lead}here` })).toBe(
      `… ́${"b".repeat(28)}here`
    );
  });

  it("should show the words before an empty link that ends the line", () => {
    const line = `${"a".repeat(59)} `;

    expect(contextFrom({ at: line.length, context: line })).toBe(
      `…${"a".repeat(32)} `
    );
  });

  it("should show the words before an empty link behind several spaces", () => {
    const line = `${"a".repeat(59)}   `;

    expect(contextFrom({ at: line.length, context: line })).toBe(
      `…${"a".repeat(32)}   `
    );
  });

  it("should show the words before an empty link with text after it", () => {
    expect(contextFrom({ at: 60, context: `${"a".repeat(59)} .` })).toBe(
      `…${"a".repeat(32)} .`
    );
  });

  it("should show the end of a long word before its link", () => {
    expect(contextFrom({ at: 60, context: `${"a".repeat(59)} here` })).toBe(
      `…${"a".repeat(32)} here`
    );
  });
});
