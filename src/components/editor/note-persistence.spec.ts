import { describe, expect, it } from "vitest";
import { createNotePersistence } from "./note-persistence";

const initial = {
  content: "# Errands\n\nbody",
  kind: "note",
  path: "shopping.md",
  updatedAt: new Date(0),
} as const;

describe("note persistence", () => {
  it("should defer a missing-file observation while newer typing overlaps a save", async () => {
    const held = Promise.withResolvers<{ path: string; updatedAt: Date }>();
    const note = createNotePersistence(initial, {
      changePath: () => Promise.reject(new Error("no move requested")),
      onPathChanged: () => undefined,
      write: () => held.promise,
    });
    note.edit({ content: "# Errands\n\nfirst edit", mode: "body" });
    const saving = note.save();
    await Promise.resolve();
    note.edit({ content: "# Errands\n\nnewer typing", mode: "body" });
    note.receiveFile("shopping.md", undefined, true);
    expect(note.store.state.missing).toBe(false);
    held.resolve({ path: "shopping.md", updatedAt: new Date(1) });
    await saving;
    note.receiveFile("shopping.md", undefined, true);
    expect(note.store.state.missing).toBe(true);
    expect(note.store.state.content).toContain("newer typing");
  });

  it("should keep newer writing when a rename save finishes", async () => {
    const held = Promise.withResolvers<{ path: string; updatedAt: Date }>();
    const writes: unknown[] = [];
    const changes: string[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => Promise.reject(new Error("no move requested")),
      onDocumentChanged: (content) => changes.push(content),
      onPathChanged: () => undefined,
      write: (path, content, name) => {
        writes.push({ content, name, path });
        return writes.length === 1
          ? held.promise
          : Promise.resolve({ path, updatedAt: new Date(2) });
      },
    });
    const renaming = note.changePath({
      kind: "retitle",
      title: "Weekend errands",
    });
    expect(note.store.state.content).toBe("# Weekend errands\n\nbody");
    await Promise.resolve();
    note.edit({
      content: "# Weekend errands\n\nbody with newer writing",
      mode: "body",
    });
    held.resolve({ path: "weekend-errands.md", updatedAt: new Date(1) });
    await renaming;
    expect(note.store.state.status).toBe("dirty");
    expect(note.store.state.content).toContain("newer writing");
    await note.flush();
    expect(writes).toEqual([
      {
        content: "# Weekend errands\n\nbody",
        name: { kind: "heading" },
        path: "shopping.md",
      },
      {
        content: "# Weekend errands\n\nbody with newer writing",
        name: null,
        path: "weekend-errands.md",
      },
    ]);
    expect(changes).toEqual(["# Weekend errands\n\nbody"]);
  });

  it("should undo the heading and filename while their save is still pending", async () => {
    const held = Promise.withResolvers<{ path: string; updatedAt: Date }>();
    const writes: unknown[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => Promise.reject(new Error("no move requested")),
      onPathChanged: () => undefined,
      write: (path, content, name) => {
        writes.push({ content, name, path });
        return writes.length === 1
          ? held.promise
          : Promise.resolve({ path: "shopping.md", updatedAt: new Date(2) });
      },
    });
    const renaming = note.changePath({
      kind: "retitle",
      title: "Weekend errands",
    });
    await Promise.resolve();
    expect(note.applyHistory("undo")).toBe(true);
    expect(note.store.state.content).toBe(initial.content);
    held.resolve({ path: "weekend-errands-2.md", updatedAt: new Date(1) });
    await renaming;
    await note.flush();
    expect(writes.at(-1)).toEqual({
      content: initial.content,
      name: { kind: "filename", value: "shopping.md" },
      path: "weekend-errands-2.md",
    });
    expect(note.store.state).toMatchObject({
      path: "shopping.md",
      status: "saved",
    });
  });

  it("should preserve the action after a failed save and retry it", async () => {
    let attempts = 0;
    const note = createNotePersistence(initial, {
      changePath: () => Promise.reject(new Error("no move requested")),
      onPathChanged: () => undefined,
      write: (_path, _content, name) => {
        expect(name).toEqual({ kind: "heading" });
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error("disk full"))
          : Promise.resolve({ path: "weekend.md", updatedAt: new Date(1) });
      },
    });
    await expect(
      note.changePath({ kind: "retitle", title: "Weekend" })
    ).rejects.toThrow("disk full");
    expect(note.store.state).toMatchObject({
      content: "# Weekend\n\nbody",
      path: "shopping.md",
      status: "failed",
    });
    expect(await note.flush()).toBe(true);
    expect(note.store.state.path).toBe("weekend.md");
  });

  it("should not request renaming after reads, external updates, or body edits", async () => {
    const writes: unknown[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => Promise.reject(new Error("no move requested")),
      onPathChanged: () => undefined,
      write: (path, _content, name) => {
        writes.push(name);
        return Promise.resolve({ path, updatedAt: new Date(3) });
      },
    });
    await note.flush();
    expect(writes).toEqual([]);
    note.receiveFile(
      "shopping.md",
      { content: "# Changed elsewhere\n\nbody", updatedAt: new Date(1) },
      false
    );
    await note.flush();
    expect(writes).toEqual([]);
    note.edit({ content: "# Changed elsewhere\n\nnew body", mode: "body" });
    await note.flush();
    expect(writes).toEqual([null]);
  });

  it("should carry a heading touch through a save whose text is unchanged", async () => {
    const writes: unknown[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => Promise.reject(new Error("no move requested")),
      onPathChanged: () => undefined,
      write: (path, _content, name) => {
        writes.push(name);
        return Promise.resolve({ path, updatedAt: new Date(1) });
      },
    });
    note.edit(
      { content: initial.content, mode: "body" },
      { headingEdited: true }
    );
    await note.flush();
    expect(writes).toEqual([{ kind: "heading" }]);
  });

  it("should run queued moves from the last committed path without capturing old documents", async () => {
    const paths: string[] = [];
    const note = createNotePersistence(initial, {
      changePath: (path, change) => {
        paths.push(path);
        return Promise.resolve({
          file: { content: initial.content, updatedAt: new Date(1) },
          path: `${change.folder}/shopping.md`,
        });
      },
      onPathChanged: () => undefined,
      write: (path) => Promise.resolve({ path, updatedAt: new Date(1) }),
    });
    const first = note.changePath({ folder: "one", kind: "move" });
    const second = note.changePath({ folder: "two", kind: "move" });
    note.edit({ content: "# Errands\n\nnewer body", mode: "body" });
    await first;
    await second;
    expect(paths).toEqual(["shopping.md", "one/shopping.md"]);
    expect(note.store.state).toMatchObject({
      content: "# Errands\n\nnewer body",
      path: "two/shopping.md",
      pendingPaths: 0,
    });
  });
  it("should keep source, pin, and tag edits in one document while saving takes time", async () => {
    const held = Promise.withResolvers<{ path: string; updatedAt: Date }>();
    const writes: string[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => Promise.reject(new Error("no move requested")),
      onPathChanged: () => undefined,
      write: (path, content) => {
        writes.push(content);
        return writes.length === 1
          ? held.promise
          : Promise.resolve({ path, updatedAt: new Date(2) });
      },
    });
    const pinning = note.editMetadata({ pinned: true });
    await Promise.resolve();
    note.edit({
      content:
        "---\npinned: true\ncustom: from source\n---\n# Errands\n\nnew body",
      mode: "document",
    });
    const tagging = note.editMetadata({ tags: ["fresh"] });
    held.resolve({ path: "shopping.md", updatedAt: new Date(1) });
    await pinning;
    await tagging;
    expect(writes.at(-1)).toBe(
      "---\npinned: true\ntags: [fresh]\ncustom: from source\n---\n# Errands\n\nnew body"
    );
    note.applyHistory("undo");
    expect(note.store.state.content).toBe(
      "---\npinned: true\ncustom: from source\n---\n# Errands\n\nnew body"
    );
  });

  it("should adopt a clean external metadata change without saving or renaming", async () => {
    const writes: string[] = [];
    const observed: string[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => Promise.reject(new Error("no move requested")),
      onDocumentChanged: (content) => observed.push(content),
      onPathChanged: () => undefined,
      write: (path, content) => {
        writes.push(content);
        return Promise.resolve({ path, updatedAt: new Date(2) });
      },
    });
    const externalContent = "---\ntags: [external]\n---\n# Errands\n\nbody";
    note.receiveFile(
      "shopping.md",
      { content: externalContent, updatedAt: new Date(1) },
      false
    );
    expect(note.store.state.content).toBe(externalContent);
    await note.flush();
    expect(writes).toEqual([]);
    expect(observed).toEqual([externalContent]);
  });
});
