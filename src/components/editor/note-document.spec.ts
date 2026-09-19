import { describe, expect, it, vi } from "vitest";

import { createNoteDocument } from "./note-document";
import type { SelectionReader } from "./note-document";

describe("note document", () => {
  it("should rename a prose title and undo its saved filename", () => {
    const note = createNoteDocument("buy milk\n\nbody", "imported.md");
    note.edit("buy oat milk\n\nbody", { separate: true, titleEdited: true });
    expect(note.naming()).toStrictEqual({ kind: "content" });
    note.acknowledgeName(note.nameId(), "buy-oat-milk-2.md");
    note.undo();
    expect(note.content()).toBe("buy milk\n\nbody");
    expect(note.naming()).toStrictEqual({
      kind: "filename",
      value: "imported.md",
    });
    note.redo();
    expect(note.content()).toBe("buy oat milk\n\nbody");
    expect(note.naming()).toStrictEqual({
      kind: "filename",
      value: "buy-oat-milk-2.md",
    });
    note.destroy();
  });

  it("should preserve the filename when no content title remains", () => {
    const note = createNoteDocument("buy milk", "buy-milk.md");
    note.edit("![image](a.png)", { titleEdited: true });
    expect(note.naming()).toStrictEqual({
      kind: "filename",
      value: "buy-milk.md",
    });
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
    expect(note.naming()).toStrictEqual({
      kind: "filename",
      value: "imported.md",
    });
    const title = note.content().indexOf("Old") + 1;
    note.editor.view.dispatch(
      note.editor.state.tr.insertText("New", title, title + 3)
    );
    expect(note.naming()).toStrictEqual({ kind: "content" });
    note.destroy();
  });

  it("should leave an imported filename alone until a heading edit", () => {
    const note = createNoteDocument("# Errands\n\nbody", "shopping.md");
    expect(note.naming()).toStrictEqual({
      kind: "filename",
      value: "shopping.md",
    });
    note.edit("# Errands\n\nmore body", { titleEdited: false });
    expect(note.naming()).toStrictEqual({
      kind: "filename",
      value: "shopping.md",
    });
    note.edit("# Errands\n\nmore body", { titleEdited: true });
    expect(note.naming()).toStrictEqual({ kind: "content" });
  });

  it("should undo a rename and its actual filename together", () => {
    const note = createNoteDocument("# Errands\n\nbody", "shopping.md");
    note.rename("Weekend errands");
    note.acknowledgeName(note.nameId(), "weekend-errands-2.md");
    expect(note.content()).toBe("# Weekend errands\n\nbody");
    note.undo();
    expect(note.content()).toBe("# Errands\n\nbody");
    expect(note.naming()).toStrictEqual({
      kind: "filename",
      value: "shopping.md",
    });
    note.redo();
    expect(note.content()).toBe("# Weekend errands\n\nbody");
    expect(note.naming()).toStrictEqual({
      kind: "filename",
      value: "weekend-errands-2.md",
    });
  });

  it("should recompute a suffix on the next heading edit", () => {
    const note = createNoteDocument("# Errands", "errands-2.md");
    note.edit("# Errands ", { titleEdited: true });
    note.acknowledgeName(note.nameId(), "errands-2.md");
    note.edit("# Errands", { titleEdited: true });
    expect(note.naming()).toStrictEqual({ kind: "content" });
  });

  it("should name the next readable line when the heading is removed", () => {
    const note = createNoteDocument("# Errands\n\nbody", "errands.md");
    note.edit("body", { titleEdited: true });
    expect(note.naming()).toStrictEqual({ kind: "content" });
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

  it("should share native source history with edits made before mounting and while detached", () => {
    const note = createNoteDocument("*hello*", "hello.md");
    note.edit("_hello_", { separate: true, titleEdited: false });
    const host = document.createElement("div");
    note.editor.mount(host);
    expect(host.textContent).toBe("_hello_");
    expect(note.editor.commands.undo()).toBeTruthy();
    expect(note.content()).toBe("*hello*");
    note.editor.unmount();
    expect(note.redo()).toBeTruthy();
    note.editor.mount(host);
    expect(host.textContent).toBe("_hello_");
    note.destroy();
  });

  it("should reset source undo at an external version while retaining its view and caret", () => {
    const note = createNoteDocument("# Title\nbody", "title.md");
    const host = document.createElement("div");
    note.editor.mount(host);
    note.edit("# Title\nbody typed", { titleEdited: false });
    note.editor.commands.setTextSelection(19);
    const surface = host.querySelector(".ProseMirror");
    note.replace("# Longer title\nbody typed");
    expect(host.querySelector(".ProseMirror")).toBe(surface);
    expect(note.selection()).toStrictEqual({ anchor: 25, head: 25 });
    expect(note.editor.commands.undo()).toBeFalsy();
    expect(note.content()).toBe("# Longer title\nbody typed");
    note.destroy();
  });

  it("should read the deferred selection only when an edit opens an undo step, and land undo there", () => {
    const note = createNoteDocument("plain body", "a.md");
    const read = vi.fn<SelectionReader>(() => ({ anchor: 5, head: 5 }));
    note.deferSelection(read);
    note.edit("plainx body", { titleEdited: false });
    expect(read).toHaveBeenCalledOnce();
    note.deferSelection(read);
    note.edit("plainxy body", { titleEdited: false });
    expect(read).toHaveBeenCalledOnce();
    note.deferSelection(() => ({ anchor: 0, head: 0 }));
    expect(note.undo()).toBeTruthy();
    expect(note.content()).toBe("plain body");
    expect(note.selection()).toStrictEqual({ anchor: 5, head: 5 });
    note.destroy();
  });

  it("should read the deferred selection before a rename", () => {
    const note = createNoteDocument("# Title\n\nbody", "title.md");
    const read = vi.fn<SelectionReader>(() => ({ anchor: 12, head: 12 }));
    note.deferSelection(read);
    note.rename("Longer title");
    expect(read).toHaveBeenCalledOnce();
    note.undo();
    expect(note.selection()).toStrictEqual({ anchor: 12, head: 12 });
    note.destroy();
  });

  it("should land redo where the caret was before the undo", () => {
    const note = createNoteDocument("plain body", "a.md");
    note.edit("plain body!", { titleEdited: false });
    note.deferSelection(() => ({ anchor: 2, head: 2 }));
    note.undo();
    note.deferSelection(() => ({ anchor: 7, head: 7 }));
    note.redo();
    expect(note.content()).toBe("plain body!");
    expect(note.selection()).toStrictEqual({ anchor: 2, head: 2 });
    note.undo();
    expect(note.selection()).toStrictEqual({ anchor: 7, head: 7 });
    note.destroy();
  });

  it("should keep the edit when the reader cannot answer", () => {
    const note = createNoteDocument("body", "a.md");
    note.deferSelection(vi.fn<SelectionReader>());
    note.edit("body typed", { titleEdited: false });
    expect(note.content()).toBe("body typed");
    note.undo();
    expect(note.content()).toBe("body");
    note.destroy();
  });

  it("should drop the reader at an external version and at teardown", () => {
    const note = createNoteDocument("body", "a.md");
    const read = vi.fn<SelectionReader>(() => ({ anchor: 0, head: 0 }));
    note.deferSelection(read);
    note.replace("new body");
    note.edit("new body typed", { titleEdited: false });
    expect(read).not.toHaveBeenCalled();
    note.deferSelection(read);
    note.destroy();
    expect(read).not.toHaveBeenCalled();
  });
});
