import { describe, expect, it, vi } from "vitest";

import { FileError } from "@/core/errors";

import { createNotePersistence } from "./note-persistence";
import type { SaveOutcome } from "./note-persistence";

interface DiskFile {
  content: string;
  revision: string;
  updatedAt: Date;
}

const initial = {
  content: "# Errands\n\nbody",
  path: "shopping.md",
  revision: "r0",
  updatedAt: new Date(0),
} as const;

describe("note persistence", () => {
  it("should keep the replacement document listener when the previous listener unsubscribes", async () => {
    const observed: string[] = [];
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: () => {
        throw new Error("no write requested");
      },
    });
    const unsubscribePrevious = note.onDocumentChanged(() => {
      throw new Error("the previous listener received a change");
    });
    const unsubscribeCurrent = note.onDocumentChanged((content) => {
      observed.push(content);
    });
    unsubscribePrevious();
    disk = { content: "# Updated", revision: "r1", updatedAt: new Date(1) };
    await note.refresh();
    expect(observed).toStrictEqual(["# Updated"]);
    unsubscribeCurrent();
    disk = { content: "# Later", revision: "r2", updatedAt: new Date(2) };
    await note.refresh();
    expect(observed).toStrictEqual(["# Updated"]);
  });

  it("should defer a missing-file observation while newer typing overlaps a save", async () => {
    const held = Promise.withResolvers<SaveOutcome>();
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: async () => await held.promise,
    });
    note.edit({ content: "# Errands\n\nfirst edit", mode: "body" });
    const saving = note.save();
    await Promise.resolve();
    note.edit({ content: "# Errands\n\nnewer typing", mode: "body" });
    disk = undefined;
    await note.refresh();
    expect(note.store.state.missing).toBeFalsy();
    held.resolve({
      kind: "committed",
      receipt: { path: "shopping.md", revision: "r1", updatedAt: new Date(1) },
    });
    await saving;
    disk = undefined;
    await note.refresh();
    expect(note.store.state.missing).toBeTruthy();
    expect(note.store.state.content).toContain("newer typing");
  });

  it("should keep newer writing when a rename save finishes", async () => {
    const held = Promise.withResolvers<SaveOutcome>();
    const writes: unknown[] = [];
    const changes: string[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: () => {
        throw new Error("no read requested");
      },
      stash: async () => {},
      write: async (path, content, name) => {
        writes.push({ content, name, path });
        return writes.length === 1
          ? await held.promise
          : await Promise.resolve({
              kind: "committed",
              receipt: { path, revision: "r2", updatedAt: new Date(2) },
            });
      },
    });
    note.onDocumentChanged((content) => {
      changes.push(content);
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
    held.resolve({
      kind: "committed",
      receipt: {
        path: "weekend-errands.md",
        revision: "r1",
        updatedAt: new Date(1),
      },
    });
    await renaming;
    expect(note.store.state.status).toBe("dirty");
    expect(note.store.state.content).toContain("newer writing");
    await note.flush();
    expect(writes).toStrictEqual([
      {
        content: "# Weekend errands\n\nbody",
        name: { kind: "content" },
        path: "shopping.md",
      },
      {
        content: "# Weekend errands\n\nbody with newer writing",
        name: null,
        path: "weekend-errands.md",
      },
    ]);
    expect(changes).toStrictEqual(["# Weekend errands\n\nbody"]);
  });

  it("should undo the heading and filename while their save is still pending", async () => {
    const held = Promise.withResolvers<SaveOutcome>();
    const writes: unknown[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: () => {
        throw new Error("no read requested");
      },
      stash: async () => {},
      write: async (path, content, name) => {
        writes.push({ content, name, path });
        return writes.length === 1
          ? await held.promise
          : await Promise.resolve({
              kind: "committed",
              receipt: {
                path: "shopping.md",
                revision: "r2",
                updatedAt: new Date(2),
              },
            });
      },
    });
    const renaming = note.changePath({
      kind: "retitle",
      title: "Weekend errands",
    });
    await Promise.resolve();
    expect(note.applyHistory("undo")).toBeTruthy();
    expect(note.store.state.content).toBe(initial.content);
    held.resolve({
      kind: "committed",
      receipt: {
        path: "weekend-errands-2.md",
        revision: "r1",
        updatedAt: new Date(1),
      },
    });
    await renaming;
    await note.flush();
    expect(writes.at(-1)).toStrictEqual({
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
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: () => {
        throw new Error("no read requested");
      },
      stash: async () => {},
      write: async (_path, _content, name) => {
        expect(name).toStrictEqual({ kind: "content" });
        attempts += 1;
        return attempts === 1
          ? await Promise.reject(new Error("disk full"))
          : await Promise.resolve({
              kind: "committed",
              receipt: {
                path: "weekend.md",
                revision: "r1",
                updatedAt: new Date(1),
              },
            });
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
    await expect(note.flush()).resolves.toBeTruthy();
    expect(note.store.state.path).toBe("weekend.md");
  });

  it("should not request renaming after reads, external updates, or body edits", async () => {
    const writes: unknown[] = [];
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: async (path, _content, name) => {
        writes.push(name);
        return {
          kind: "committed",
          receipt: { path, revision: "r3", updatedAt: new Date(3) },
        };
      },
    });
    await note.flush();
    expect(writes).toStrictEqual([]);
    disk = {
      content: "# Changed elsewhere\n\nbody",
      revision: "r1",
      updatedAt: new Date(1),
    };
    await note.refresh();
    await note.flush();
    expect(writes).toStrictEqual([]);
    note.edit({ content: "# Changed elsewhere\n\nnew body", mode: "body" });
    await note.flush();
    expect(writes).toStrictEqual([null]);
  });

  it("should carry a heading touch through a save whose text is unchanged", async () => {
    const writes: unknown[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: () => {
        throw new Error("no read requested");
      },
      stash: async () => {},
      write: async (path, _content, name) => {
        writes.push(name);
        return {
          kind: "committed",
          receipt: { path, revision: "r1", updatedAt: new Date(1) },
        };
      },
    });
    note.edit(
      { content: initial.content, mode: "body" },
      { titleEdited: true }
    );
    await note.flush();
    expect(writes).toStrictEqual([{ kind: "content" }]);
  });

  it("should run queued moves from the last committed path without capturing old documents", async () => {
    const paths: string[] = [];
    const note = createNotePersistence(initial, {
      changePath: async (path, change) => {
        paths.push(path);
        return {
          file: {
            content: initial.content,
            revision: "r1",
            updatedAt: new Date(1),
          },
          path: `${change.folder}/shopping.md`,
        };
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: () => {
        throw new Error("no read requested");
      },
      stash: async () => {},
      write: async (path) => ({
        kind: "committed",
        receipt: { path, revision: "r1", updatedAt: new Date(1) },
      }),
    });
    const first = note.changePath({ folder: "one", kind: "move" });
    const second = note.changePath({ folder: "two", kind: "move" });
    note.edit({ content: "# Errands\n\nnewer body", mode: "body" });
    await first;
    await second;
    expect(paths).toStrictEqual(["shopping.md", "one/shopping.md"]);
    expect(note.store.state).toMatchObject({
      content: "# Errands\n\nnewer body",
      path: "two/shopping.md",
      pendingPaths: 0,
    });
  });

  it("should keep source, pin, and tag edits in one document while saving takes time", async () => {
    const held = Promise.withResolvers<SaveOutcome>();
    const writes: string[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: () => {
        throw new Error("no read requested");
      },
      stash: async () => {},
      write: async (path, content) => {
        writes.push(content);
        return writes.length === 1
          ? await held.promise
          : await Promise.resolve({
              kind: "committed",
              receipt: { path, revision: "r2", updatedAt: new Date(2) },
            });
      },
    });
    const pinning = note.editMetadata(() => ({ pinned: true }));
    await Promise.resolve();
    note.edit({
      content:
        "---\npinned: true\ncustom: from source\n---\n# Errands\n\nnew body",
      mode: "document",
    });
    const tagging = note.editMetadata(() => ({ tags: ["fresh"] }));
    held.resolve({
      kind: "committed",
      receipt: { path: "shopping.md", revision: "r1", updatedAt: new Date(1) },
    });
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
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: async (path, content) => {
        writes.push(content);
        return {
          kind: "committed",
          receipt: { path, revision: "r2", updatedAt: new Date(2) },
        };
      },
    });
    note.onDocumentChanged((content) => {
      observed.push(content);
    });
    const externalContent = "---\ntags: [external]\n---\n# Errands\n\nbody";
    disk = { content: externalContent, revision: "r1", updatedAt: new Date(1) };
    await note.refresh();
    expect(note.store.state.content).toBe(externalContent);
    await note.flush();
    expect(writes).toStrictEqual([]);
    expect(observed).toStrictEqual([externalContent]);
  });

  it("should reconcile a newer file observed during a save without receiving it twice", async () => {
    const held = Promise.withResolvers<SaveOutcome>();
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: async () => await held.promise,
    });
    const release = note.retain();
    note.edit({ content: "# Errands\n\nlocal edit", mode: "body" });
    const saving = note.save();
    await Promise.resolve();
    disk = {
      content: "# Errands\n\nexternal edit",
      revision: "r2",
      updatedAt: new Date(2),
    };
    await note.refresh();
    expect(note.store.state.content).toContain("local edit");
    held.resolve({
      kind: "committed",
      receipt: { path: "shopping.md", revision: "r1", updatedAt: new Date(1) },
    });
    await saving;
    expect(note.store.state.content).toBe("# Errands\n\nexternal edit");
    expect(note.applyHistory("undo")).toBeFalsy();
    await release();
  });

  it("should discard a deferred missing observation after the save changes the path", async () => {
    const held = Promise.withResolvers<SaveOutcome>();
    let closed = false;
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onCleanFileMissing: () => {
        closed = true;
      },
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: async () => await held.promise,
    });
    const release = note.retain();
    const saving = note.changePath({ kind: "retitle", title: "Weekend" });
    await Promise.resolve();
    disk = undefined;
    await note.refresh();
    held.resolve({
      kind: "committed",
      receipt: { path: "weekend.md", revision: "r1", updatedAt: new Date(1) },
    });
    await saving;
    expect(note.store.state).toMatchObject({
      missing: false,
      path: "weekend.md",
      status: "saved",
    });
    expect(closed).toBeFalsy();
    await release();
  });

  it("should autosave native source edits and derive the tab state without a React publisher", async () => {
    vi.useFakeTimers();
    const writes: unknown[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: () => {
        throw new Error("no read requested");
      },
      stash: async () => {},
      write: async (path, content, name) => {
        writes.push({ content, name, path });
        return {
          kind: "committed",
          receipt: {
            path: "weekend.md",
            revision: "r1",
            updatedAt: new Date(1),
          },
        };
      },
    });
    const release = note.retain();
    const host = document.createElement("div");
    note.sourceEditor.mount(host);
    try {
      note.sourceEditor.commands.setTextSelection({ from: 3, to: 10 });
      note.sourceEditor.commands.insertContent("Weekend");
      expect(note.snapshot.state).toMatchObject({
        status: "dirty",
        title: "Weekend",
      });
      await vi.advanceTimersByTimeAsync(799);
      expect(writes).toStrictEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(writes).toStrictEqual([
        {
          content: "# Weekend\n\nbody",
          name: { kind: "content" },
          path: "shopping.md",
        },
      ]);
      expect(note.snapshot.state.status).toBe("saved");
      note.sourceEditor.commands.undo();
      expect(note.store.state.content).toBe(initial.content);
      expect(note.snapshot.state).toMatchObject({
        status: "dirty",
        title: "Errands",
      });
      await note.flush();
      expect(writes.at(-1)).toStrictEqual({
        content: initial.content,
        name: { kind: "filename", value: "shopping.md" },
        path: "weekend.md",
      });
    } finally {
      await release();
      vi.useRealTimers();
    }
  });

  it("should combine an external change with unsaved typing and save the result", async () => {
    const writes: string[] = [];
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: async (path, content) => {
        writes.push(content);
        return {
          kind: "committed",
          receipt: { path, revision: "r2", updatedAt: new Date(2) },
        };
      },
    });
    note.edit({ content: "# Errands\n\nbody\n\nmine", mode: "body" });
    disk = {
      content: "# Chores\n\nbody",
      revision: "r1",
      updatedAt: new Date(1),
    };
    await note.refresh();
    expect(note.store.state.content).toBe("# Chores\n\nbody\n\nmine");
    expect(note.store.state.status).toBe("dirty");
    expect(note.store.state.base.revision).toBe("r1");
    await note.flush();
    expect(writes).toStrictEqual(["# Chores\n\nbody\n\nmine"]);
    expect(note.store.state.status).toBe("saved");
  });

  it("should not rename after a merged heading, and reset undo at the merge", async () => {
    const names: unknown[] = [];
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: async (path, _content, name) => {
        names.push(name);
        return {
          kind: "committed",
          receipt: { path, revision: "r2", updatedAt: new Date(2) },
        };
      },
    });
    note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
    disk = {
      content: "# Chores\n\nbody",
      revision: "r1",
      updatedAt: new Date(1),
    };
    await note.refresh();
    expect(note.applyHistory("undo")).toBeFalsy();
    await note.flush();
    expect(names).toStrictEqual([null]);
  });

  it("should take identical edits on both sides without review", async () => {
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: () => {
        throw new Error("no save requested");
      },
    });
    note.edit({ content: "# Errands\n\nsame words", mode: "body" });
    disk = {
      content: "# Errands\n\nsame words",
      revision: "r1",
      updatedAt: new Date(1),
    };
    await note.refresh();
    expect(note.store.state.content).toBe("# Errands\n\nsame words");
    expect(note.store.state.status).toBe("dirty");
    expect(note.store.state.theirs).toBeUndefined();
  });

  it("should keep newer typing when its own save echoes back", async () => {
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: async (path) => ({
        kind: "committed",
        receipt: { path, revision: "r1", updatedAt: new Date(1) },
      }),
    });
    note.edit({ content: "# Errands\n\nsaved words", mode: "body" });
    await note.flush();
    note.edit({ content: "# Errands\n\nsaved words, and more", mode: "body" });
    disk = {
      content: "# Errands\n\nsaved words",
      revision: "r1",
      updatedAt: new Date(4),
    };
    await note.refresh();
    expect(note.store.state.content).toBe("# Errands\n\nsaved words, and more");
    expect(note.store.state.status).toBe("dirty");
    expect(note.store.state.updatedAt).toStrictEqual(new Date(4));
  });

  it("should ignore a read older than its last save", async () => {
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: async (path) => ({
        kind: "committed",
        receipt: { path, revision: "r1", updatedAt: new Date(5) },
      }),
    });
    note.edit({ content: "# Errands\n\nsaved words", mode: "body" });
    await note.flush();
    disk = {
      content: "# Errands\n\nbody",
      revision: "r0",
      updatedAt: new Date(3),
    };
    await note.refresh();
    expect(note.store.state.content).toBe("# Errands\n\nsaved words");
    expect(note.store.state.status).toBe("saved");
  });

  it("should pause saving and stash the review when edits overlap", async () => {
    const writes: string[] = [];
    const stashes: unknown[] = [];
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async (path, stash) => {
        stashes.push({ path, stash });
      },
      write: async (path, content) => {
        writes.push(content);
        return {
          kind: "committed",
          receipt: { path, revision: "r2", updatedAt: new Date(2) },
        };
      },
    });
    note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
    disk = {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    };
    await note.refresh();
    expect(note.store.state.status).toBe("conflict");
    expect(note.store.state.content).toBe("# Errands\n\nbody, mine");
    expect(note.store.state.theirs).toStrictEqual({
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    });
    expect(note.store.state.base.revision).toBe("r0");
    note.edit({ content: "# Errands\n\nbody, mine, more", mode: "body" });
    expect(note.store.state.status).toBe("conflict");
    await expect(note.flush()).resolves.toBeTruthy();
    expect(writes).toStrictEqual([]);
    expect(stashes).toStrictEqual([
      {
        path: "shopping.md",
        stash: {
          base: {
            content: initial.content,
            revision: "r0",
            updatedAt: new Date(0),
          },
          ours: "# Errands\n\nbody, mine",
        },
      },
      {
        path: "shopping.md",
        stash: {
          base: {
            content: initial.content,
            revision: "r0",
            updatedAt: new Date(0),
          },
          ours: "# Errands\n\nbody, mine, more",
        },
      },
    ]);
  });

  it("should report an unsafe quit when the review cannot be stashed", async () => {
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: () => {
        throw new Error("The disk is full");
      },
      write: () => {
        throw new Error("no save requested");
      },
    });
    note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
    disk = {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    };
    await note.refresh();
    await Promise.resolve();
    expect(note.store.state.reason).toBe("The disk is full");
    await expect(note.flush()).resolves.toBeFalsy();
    expect(note.store.state.status).toBe("conflict");
    await expect(note.editMetadata(() => ({ pinned: true }))).rejects.toThrow(
      "The disk is full"
    );
  });

  it("should refuse a folder move while a review is open", async () => {
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: () => {
        throw new Error("no save requested");
      },
    });
    note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
    disk = {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    };
    await note.refresh();
    await expect(
      note.changePath({ folder: "archive", kind: "move" })
    ).rejects.toThrow("This note needs review before it can move");
    expect(note.store.state.pendingPaths).toBe(0);
  });

  it("should note a file that changes again during review without stashing twice", async () => {
    const stashes: unknown[] = [];
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async (_path, stash) => {
        stashes.push(stash.ours);
      },
      write: () => {
        throw new Error("no save requested");
      },
    });
    note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
    disk = {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    };
    await note.refresh();
    disk = {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(2),
    };
    await note.refresh();
    expect(note.store.state.changedAgain).toBeFalsy();
    disk = {
      content: "# Errands\n\nbody, on disk again",
      revision: "r2",
      updatedAt: new Date(3),
    };
    await note.refresh();
    expect(note.store.state.status).toBe("conflict");
    expect(note.store.state.changedAgain).toBeTruthy();
    expect(note.store.state.theirs?.revision).toBe("r2");
    await Promise.resolve();
    expect(stashes).toStrictEqual(["# Errands\n\nbody, mine"]);
  });

  it("should leave review and clear the stash once a later change combines", async () => {
    const cleared: string[] = [];
    const writes: string[] = [];
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async (path) => {
        cleared.push(path);
      },
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: async (path, content) => {
        writes.push(content);
        return {
          kind: "committed",
          receipt: { path, revision: "r3", updatedAt: new Date(3) },
        };
      },
    });
    note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
    disk = {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    };
    await note.refresh();
    await Promise.resolve();
    disk = {
      content: "# Chores\n\nbody",
      revision: "r2",
      updatedAt: new Date(2),
    };
    await note.refresh();
    expect(note.store.state.status).toBe("dirty");
    expect(note.store.state.content).toBe("# Chores\n\nbody, mine");
    await note.flush();
    expect(writes).toStrictEqual(["# Chores\n\nbody, mine"]);
    expect(cleared).toStrictEqual(["shopping.md"]);
    expect(note.store.state.status).toBe("saved");
  });

  it("should keep a committed save when its stored review cannot be removed, and try again on each flush", async () => {
    let clears = 0;
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: () => {
        clears += 1;
        throw new Error("Permission denied");
      },
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: async (path) => ({
        kind: "committed",
        receipt: { path, revision: "r3", updatedAt: new Date(3) },
      }),
    });
    note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
    disk = {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    };
    await note.refresh();
    await Promise.resolve();
    disk = {
      content: "# Chores\n\nbody",
      revision: "r2",
      updatedAt: new Date(2),
    };
    await note.refresh();
    await expect(note.flush()).resolves.toBeTruthy();
    expect(note.store.state.status).toBe("saved");
    expect(note.store.state.reason).toBeUndefined();
    note.edit({ content: "# Chores\n\nbody, more", mode: "body" });
    await expect(note.flush()).resolves.toBeTruthy();
    expect(clears).toBe(2);
    await expect(note.flush()).resolves.toBeTruthy();
    expect(clears).toBe(3);
  });

  it("should hold a failed save through an external change that combines cleanly", async () => {
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: async () => await Promise.reject(new Error("Permission denied")),
    });
    note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
    await expect(note.flush()).resolves.toBeFalsy();
    expect(note.store.state.status).toBe("failed");
    disk = {
      content: "# Chores\n\nbody",
      revision: "r1",
      updatedAt: new Date(1),
    };
    await note.refresh();
    expect(note.store.state).toMatchObject({
      content: "# Chores\n\nbody, mine",
      reason: "Permission denied",
      status: "failed",
    });
  });

  it("should hold a pin change with the unsaved text while a review is open", async () => {
    const stashes: string[] = [];
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async (_path, stash) => {
        stashes.push(stash.ours);
      },
      write: () => {
        throw new Error("no save requested");
      },
    });
    note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
    disk = {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    };
    await note.refresh();
    await note.editMetadata(() => ({ pinned: true }));
    expect(note.store.state.status).toBe("conflict");
    expect(note.snapshot.state.pinned).toBeTruthy();
    expect(stashes.at(-1)).toBe(
      "---\npinned: true\n---\n# Errands\n\nbody, mine"
    );
  });

  it("should resolve a review, save the result, and clear the stored review", async () => {
    const cleared: string[] = [];
    const writes: string[] = [];
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async (path) => {
        cleared.push(path);
      },
      onPathChanged: () => {},
      read: async () => {
        if (disk === undefined) {
          throw new FileError({ kind: "not-found", message: "No such file" });
        }
        return disk;
      },
      stash: async () => {},
      write: async (path, content) => {
        writes.push(content);
        return {
          kind: "committed",
          receipt: { path, revision: "r2", updatedAt: new Date(2) },
        };
      },
    });
    note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
    disk = {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    };
    await note.refresh();
    await Promise.resolve();
    await note.resolve("# Errands\n\nbody, both");
    expect(note.store.state.content).toBe("# Errands\n\nbody, both");
    expect(note.store.state.theirs).toBeUndefined();
    expect(note.applyHistory("undo")).toBeFalsy();
    await note.flush();
    expect(writes).toStrictEqual(["# Errands\n\nbody, both"]);
    expect(cleared).toStrictEqual(["shopping.md"]);
    expect(note.store.state.status).toBe("saved");
    expect(note.store.state.base.revision).toBe("r2");
    await expect(note.resolve("again")).rejects.toThrow("Nothing to review");
  });

  it("should send the base revision with each save and take the receipt's as the next", async () => {
    const sent: string[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: () => {
        throw new Error("no read requested");
      },
      stash: async () => {},
      write: async (path, _content, _name, expected) => {
        sent.push(expected);
        return {
          kind: "committed",
          receipt: {
            path,
            revision: `r${sent.length}`,
            updatedAt: new Date(sent.length),
          },
        };
      },
    });
    note.edit({ content: "# Errands\n\nfirst", mode: "body" });
    await note.flush();
    note.edit({ content: "# Errands\n\nsecond", mode: "body" });
    await note.flush();
    expect(sent).toStrictEqual(["r0", "r1"]);
    expect(note.store.state.base.revision).toBe("r2");
  });

  it("should combine a refused save with the file it returns and save again", async () => {
    const writes: { content: string; expected: string }[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: () => {
        throw new Error("no read requested");
      },
      stash: async () => {},
      write: async (path, content, _name, expected) => {
        writes.push({ content, expected });
        return writes.length === 1
          ? {
              file: {
                content: "# Chores\n\nbody",
                revision: "r1",
                updatedAt: new Date(1),
              },
              kind: "conflict",
            }
          : {
              kind: "committed",
              receipt: { path, revision: "r2", updatedAt: new Date(2) },
            };
      },
    });
    note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
    await note.flush();
    expect(writes).toStrictEqual([
      { content: "# Errands\n\nbody, mine", expected: "r0" },
      { content: "# Chores\n\nbody, mine", expected: "r1" },
    ]);
    expect(note.store.state.content).toBe("# Chores\n\nbody, mine");
    expect(note.store.state.status).toBe("saved");
  });

  it("should hold a refused save for review when the returned file overlaps", async () => {
    const writes: string[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: () => {
        throw new Error("no read requested");
      },
      stash: async () => {},
      write: async (_path, content) => {
        writes.push(content);
        return {
          file: {
            content: "# Errands\n\nbody, on disk",
            revision: "r1",
            updatedAt: new Date(1),
          },
          kind: "conflict",
        };
      },
    });
    note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
    await expect(note.flush()).resolves.toBeTruthy();
    expect(writes).toStrictEqual(["# Errands\n\nbody, mine"]);
    expect(note.store.state.status).toBe("conflict");
    expect(note.store.state.theirs?.revision).toBe("r1");
    expect(note.store.state.content).toBe("# Errands\n\nbody, mine");
  });

  it("should refuse a folder move when the save before it is held for review", async () => {
    const moves: string[] = [];
    const note = createNotePersistence(initial, {
      changePath: async (path) => {
        moves.push(path);
        throw new Error("no move expected");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: () => {
        throw new Error("no read requested");
      },
      stash: async () => {},
      write: async () => ({
        file: {
          content: "# Errands\n\nbody, on disk",
          revision: "r1",
          updatedAt: new Date(1),
        },
        kind: "conflict",
      }),
    });
    note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
    await expect(
      note.changePath({ folder: "archive", kind: "move" })
    ).rejects.toThrow("This note needs review before it can move");
    expect(moves).toStrictEqual([]);
    expect(note.store.state.status).toBe("conflict");
  });

  it("should resume a stored review and hold it again once the file arrives", async () => {
    const writes: string[] = [];
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(
      {
        ...initial,
        content: "# Errands\n\nbody, on disk",
        revision: "r1",
        stash: {
          base: {
            content: initial.content,
            revision: "r0",
            updatedAt: new Date(0),
          },
          ours: "# Errands\n\nbody, mine",
        },
        updatedAt: new Date(1),
      },
      {
        changePath: () => {
          throw new Error("no move requested");
        },
        clearStash: async () => {},
        onPathChanged: () => {},
        read: async () => {
          if (disk === undefined) {
            throw new FileError({ kind: "not-found", message: "No such file" });
          }
          return disk;
        },
        stash: async () => {},
        write: async (_path, content) => {
          writes.push(content);
          throw new Error("no save expected");
        },
      }
    );
    expect(note.store.state.content).toBe("# Errands\n\nbody, mine");
    expect(note.store.state.status).toBe("dirty");
    disk = {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    };
    await note.refresh();
    expect(note.store.state.status).toBe("conflict");
    expect(note.store.state.theirs?.revision).toBe("r1");
    expect(note.store.state.content).toBe("# Errands\n\nbody, mine");
    await expect(note.flush()).resolves.toBeTruthy();
    expect(writes).toStrictEqual([]);
  });

  it("should resume a stored review and save once the file no longer overlaps", async () => {
    const cleared: string[] = [];
    const writes: { content: string; expected: string }[] = [];
    let disk: DiskFile | undefined = initial;
    const note = createNotePersistence(
      {
        ...initial,
        content: "# Chores\n\nbody",
        revision: "r1",
        stash: {
          base: {
            content: initial.content,
            revision: "r0",
            updatedAt: new Date(0),
          },
          ours: "# Errands\n\nbody, mine",
        },
        updatedAt: new Date(1),
      },
      {
        changePath: () => {
          throw new Error("no move requested");
        },
        clearStash: async (path) => {
          cleared.push(path);
        },
        onPathChanged: () => {},
        read: async () => {
          if (disk === undefined) {
            throw new FileError({ kind: "not-found", message: "No such file" });
          }
          return disk;
        },
        stash: async () => {},
        write: async (path, content, _name, expected) => {
          writes.push({ content, expected });
          return {
            kind: "committed",
            receipt: { path, revision: "r2", updatedAt: new Date(2) },
          };
        },
      }
    );
    disk = {
      content: "# Chores\n\nbody",
      revision: "r1",
      updatedAt: new Date(1),
    };
    await note.refresh();
    expect(note.store.state.content).toBe("# Chores\n\nbody, mine");
    await note.flush();
    expect(writes).toStrictEqual([
      { content: "# Chores\n\nbody, mine", expected: "r1" },
    ]);
    expect(cleared).toStrictEqual(["shopping.md"]);
    expect(note.store.state.status).toBe("saved");
  });

  it("should drop a read that finishes after the note moved away and back", async () => {
    const reads: PromiseWithResolvers<DiskFile>[] = [];
    let closed = false;
    const note = createNotePersistence(initial, {
      changePath: async (_path, change) => ({
        file: {
          content: initial.content,
          revision: "r0",
          updatedAt: new Date(0),
        },
        path:
          change.folder === "" ? "shopping.md" : `${change.folder}/shopping.md`,
      }),
      clearStash: async () => {},
      onCleanFileMissing: () => {
        closed = true;
      },
      onPathChanged: () => {},
      read: async () => {
        const read = Promise.withResolvers<DiskFile>();
        reads.push(read);
        return await read.promise;
      },
      stash: async () => {},
      write: () => {
        throw new Error("no write requested");
      },
    });
    const early = note.refresh();
    await note.changePath({ folder: "inbox", kind: "move" });
    await note.changePath({ folder: "", kind: "move" });
    reads[0]?.reject(
      new FileError({ kind: "not-found", message: "No such file" })
    );
    await early;
    expect(note.store.state).toMatchObject({
      missing: false,
      path: "shopping.md",
    });
    expect(closed).toBeFalsy();
  });

  it("should apply only the newest of overlapping reads", async () => {
    const reads: PromiseWithResolvers<DiskFile>[] = [];
    let closed = false;
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onCleanFileMissing: () => {
        closed = true;
      },
      onPathChanged: () => {},
      read: async () => {
        const read = Promise.withResolvers<DiskFile>();
        reads.push(read);
        return await read.promise;
      },
      stash: async () => {},
      write: () => {
        throw new Error("no write requested");
      },
    });
    const older = note.refresh();
    const newer = note.refresh();
    reads[1]?.reject(
      new FileError({ kind: "not-found", message: "No such file" })
    );
    await newer;
    reads[0]?.resolve({
      content: initial.content,
      revision: "r0",
      updatedAt: new Date(5),
    });
    await older;
    expect(note.store.state.missing).toBeTruthy();
    expect(closed).toBeTruthy();
  });

  it("should drop a read that finishes after the session is released", async () => {
    const read = Promise.withResolvers<DiskFile>();
    const observed: string[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => await read.promise,
      stash: async () => {},
      write: () => {
        throw new Error("no write requested");
      },
    });
    note.onDocumentChanged((content) => {
      observed.push(content);
    });
    const release = note.retain();
    const reading = note.refresh();
    await release();
    read.resolve({
      content: "# Later",
      revision: "r1",
      updatedAt: new Date(1),
    });
    await reading;
    expect(observed).toStrictEqual([]);
  });

  it("should report a read that fails for another reason until a read lands", async () => {
    let failure: Error | undefined = new FileError({
      kind: "failed",
      message: "Permission denied",
    });
    const note = createNotePersistence(initial, {
      changePath: () => {
        throw new Error("no move requested");
      },
      clearStash: async () => {},
      onPathChanged: () => {},
      read: async () => {
        if (failure !== undefined) {
          throw failure;
        }
        return {
          content: initial.content,
          revision: "r0",
          updatedAt: new Date(0),
        };
      },
      stash: async () => {},
      write: () => {
        throw new Error("no write requested");
      },
    });
    await note.refresh();
    expect(note.store.state).toMatchObject({
      missing: false,
      unreadable: "Permission denied",
    });
    failure = undefined;
    await note.refresh();
    expect(note.store.state.unreadable).toBeUndefined();
  });

  it("should read nothing for a draft", async () => {
    const reads: string[] = [];
    const note = createNotePersistence(
      { content: "", path: "", revision: "", updatedAt: new Date(0) },
      {
        changePath: () => {
          throw new Error("no move requested");
        },
        clearStash: async () => {},
        onPathChanged: () => {},
        read: async (path) => {
          reads.push(path);
          return { content: "", revision: "", updatedAt: new Date(0) };
        },
        stash: async () => {},
        write: () => {
          throw new Error("no write requested");
        },
      }
    );
    await note.refresh();
    expect(reads).toStrictEqual([]);
  });
});
