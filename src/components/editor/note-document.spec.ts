import { describe, expect, it } from "vitest";
import { createNoteDocument } from "./note-document";

describe("note document", () => {
  it("should rename a prose title and undo its saved filename", () => {
    const note = createNoteDocument("buy milk\n\nbody", "imported.md");
    note.edit("buy oat milk\n\nbody", { separate: true, titleEdited: true });
    expect(note.naming()).toEqual({ kind: "content" });
    note.acknowledgeName(note.nameId(), "buy-oat-milk-2.md");
    note.undo();
    expect(note.content()).toBe("buy milk\n\nbody");
    expect(note.naming()).toEqual({ kind: "filename", value: "imported.md" });
    note.redo();
    expect(note.content()).toBe("buy oat milk\n\nbody");
    expect(note.naming()).toEqual({
      kind: "filename",
      value: "buy-oat-milk-2.md",
    });
    note.destroy();
  });

  it("should preserve the filename when no content title remains", () => {
    const note = createNoteDocument("buy milk", "buy-milk.md");
    note.edit("![image](a.png)", { titleEdited: true });
    expect(note.naming()).toEqual({ kind: "filename", value: "buy-milk.md" });
    note.destroy();
  });

  it("should detect edits to a frontmatter fallback without naming tag edits", () => {
    const note = createNoteDocument(
      "---\ntitle: Old\ntags: [a]\n---\n```\ncode\n```",
      "imported.md"
    );
    const tags = note.content().indexOf("[a]") + 2;
    note.editor.view.dispatch(
      note.editor.state.tr.insertText("b", tags, tags + 1)
    );
    expect(note.naming()).toEqual({ kind: "filename", value: "imported.md" });
    const title = note.content().indexOf("Old") + 1;
    note.editor.view.dispatch(
      note.editor.state.tr.insertText("New", title, title + 3)
    );
    expect(note.naming()).toEqual({ kind: "content" });
    note.destroy();
  });

  it("should leave an imported filename alone until a heading edit", () => {
    const note = createNoteDocument("# Errands\n\nbody", "shopping.md");
    expect(note.naming()).toEqual({ kind: "filename", value: "shopping.md" });
    note.edit("# Errands\n\nmore body", { titleEdited: false });
    expect(note.naming()).toEqual({ kind: "filename", value: "shopping.md" });
    note.edit("# Errands\n\nmore body", { titleEdited: true });
    expect(note.naming()).toEqual({ kind: "content" });
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
    note.edit("# Errands ", { titleEdited: true });
    note.acknowledgeName(note.nameId(), "errands-2.md");
    note.edit("# Errands", { titleEdited: true });
    expect(note.naming()).toEqual({ kind: "content" });
  });

  it("should name the next readable line when the heading is removed", () => {
    const note = createNoteDocument("# Errands\n\nbody", "errands.md");
    note.edit("body", { titleEdited: true });
    expect(note.naming()).toEqual({ kind: "content" });
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
  note.edit("_hello_", { separate: true, titleEdited: false });
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
  note.edit("# Title\nbody typed", { titleEdited: false });
  note.select(18, 18);
  const surface = host.querySelector(".ProseMirror");
  note.replace("# Longer title\nbody typed");
  expect(host.querySelector(".ProseMirror")).toBe(surface);
  expect(note.selection()).toEqual({ anchor: 25, head: 25 });
  expect(note.editor.commands.undo()).toBe(false);
  expect(note.content()).toBe("# Longer title\nbody typed");
  note.destroy();
});
