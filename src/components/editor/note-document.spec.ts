import { describe, expect, it } from "vitest";
import { createNoteDocument } from "./note-document";

describe("note document", () => {
  it("should leave an imported filename alone until a heading edit", () => {
    const note = createNoteDocument("# Errands\n\nbody", "shopping.md");
    expect(note.naming()).toEqual({ kind: "filename", value: "shopping.md" });
    note.edit("# Errands\n\nmore body", { headingEdited: false });
    expect(note.naming()).toEqual({ kind: "filename", value: "shopping.md" });
    note.edit("# Errands\n\nmore body", { headingEdited: true });
    expect(note.naming()).toEqual({ kind: "heading" });
  });

  it("should undo a rename and its actual filename together", () => {
    const note = createNoteDocument("# Errands\n\nbody", "shopping.md");
    note.rename("Weekend errands");
    note.acknowledgeName(note.nameId(), "weekend-errands-2.md");
    expect(note.content()).toBe("# Weekend errands\n\nbody");
    note.undo();
    expect(note.content()).toBe("# Errands\n\nbody");
    expect(note.naming()).toEqual({ kind: "filename", value: "shopping.md" });
    note.redo();
    expect(note.content()).toBe("# Weekend errands\n\nbody");
    expect(note.naming()).toEqual({
      kind: "filename",
      value: "weekend-errands-2.md",
    });
  });

  it("should recompute a suffix on the next heading edit", () => {
    const note = createNoteDocument("# Errands", "errands-2.md");
    note.edit("# Errands ", { headingEdited: true });
    note.acknowledgeName(note.nameId(), "errands-2.md");
    note.edit("# Errands", { headingEdited: true });
    expect(note.naming()).toEqual({ kind: "heading" });
  });

  it("should keep the filename when the heading is removed", () => {
    const note = createNoteDocument("# Errands\n\nbody", "errands.md");
    note.edit("body", { headingEdited: true });
    expect(note.naming()).toEqual({ kind: "filename", value: "errands.md" });
  });

  it("should introduce a heading through rename without changing frontmatter", () => {
    const note = createNoteDocument(
      "---\ntitle: legacy\n---\nbody",
      "shopping.md"
    );
    note.rename("Weekend errands");
    expect(note.content()).toBe(
      "---\ntitle: legacy\n---\n# Weekend errands\n\nbody"
    );
    note.undo();
    expect(note.content()).toBe("---\ntitle: legacy\n---\nbody");
  });
});

it("should share native source history with edits made before mounting and while detached", () => {
  const note = createNoteDocument("*hello*", "hello.md");
  note.edit("_hello_", { headingEdited: false, separate: true });
  const host = document.createElement("div");
  note.editor.mount(host);
  expect(host.textContent).toBe("_hello_");
  expect(note.editor.commands.undo()).toBe(true);
  expect(note.content()).toBe("*hello*");
  note.editor.unmount();
  expect(note.redo()).toBe(true);
  note.editor.mount(host);
  expect(host.textContent).toBe("_hello_");
  note.destroy();
});

it("should reset source undo at an external version while retaining its view and caret", () => {
  const note = createNoteDocument("# Title\nbody", "title.md");
  const host = document.createElement("div");
  note.editor.mount(host);
  note.edit("# Title\nbody typed", { headingEdited: false });
  note.select(18, 18);
  const surface = host.querySelector(".ProseMirror");
  note.replace("# Longer title\nbody typed");
  expect(host.querySelector(".ProseMirror")).toBe(surface);
  expect(note.selection()).toEqual({ anchor: 25, head: 25 });
  expect(note.editor.commands.undo()).toBe(false);
  expect(note.content()).toBe("# Longer title\nbody typed");
  note.destroy();
});
