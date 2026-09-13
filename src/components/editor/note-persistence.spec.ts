import { describe, expect, it, vi } from "vitest";
import { createNotePersistence } from "./note-persistence";

const initial = {
  content: "# Errands\n\nbody",
  kind: "note",
  path: "shopping.md",
  revision: "r0",
  updatedAt: new Date(0),
} as const;

describe("note persistence", () => {
  it("should defer a missing-file observation while newer typing overlaps a save", async () => {
    const held = Promise.withResolvers<{
      path: string;
      revision: string;
      updatedAt: Date;
    }>();
    const note = createNotePersistence(initial, {
      changePath: () => Promise.reject(new Error("no move requested")),
      clearStash: () => Promise.resolve(),
      onPathChanged: () => undefined,
      stash: () => Promise.resolve(),
      write: () => held.promise,
    });
    note.edit({ content: "# Errands\n\nfirst edit", mode: "body" });
    const saving = note.save();
    await Promise.resolve();
    note.edit({ content: "# Errands\n\nnewer typing", mode: "body" });
    note.receiveFile("shopping.md", undefined, true);
    expect(note.store.state.missing).toBe(false);
    held.resolve({
      path: "shopping.md",
      revision: "r1",
      updatedAt: new Date(1),
    });
    await saving;
    note.receiveFile("shopping.md", undefined, true);
    expect(note.store.state.missing).toBe(true);
    expect(note.store.state.content).toContain("newer typing");
  });

  it("should keep newer writing when a rename save finishes", async () => {
    const held = Promise.withResolvers<{
      path: string;
      revision: string;
      updatedAt: Date;
    }>();
    const writes: unknown[] = [];
    const changes: string[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => Promise.reject(new Error("no move requested")),
      clearStash: () => Promise.resolve(),
      onDocumentChanged: (content) => changes.push(content),
      onPathChanged: () => undefined,
      stash: () => Promise.resolve(),
      write: (path, content, name) => {
        writes.push({ content, name, path });
        return writes.length === 1
          ? held.promise
          : Promise.resolve({ path, revision: "r2", updatedAt: new Date(2) });
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
    held.resolve({
      path: "weekend-errands.md",
      revision: "r1",
      updatedAt: new Date(1),
    });
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
    const held = Promise.withResolvers<{
      path: string;
      revision: string;
      updatedAt: Date;
    }>();
    const writes: unknown[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => Promise.reject(new Error("no move requested")),
      clearStash: () => Promise.resolve(),
      onPathChanged: () => undefined,
      stash: () => Promise.resolve(),
      write: (path, content, name) => {
        writes.push({ content, name, path });
        return writes.length === 1
          ? held.promise
          : Promise.resolve({
              path: "shopping.md",
              revision: "r2",
              updatedAt: new Date(2),
            });
      },
    });
    const renaming = note.changePath({
      kind: "retitle",
      title: "Weekend errands",
    });
    await Promise.resolve();
    expect(note.applyHistory("undo")).toBe(true);
    expect(note.store.state.content).toBe(initial.content);
    held.resolve({
      path: "weekend-errands-2.md",
      revision: "r1",
      updatedAt: new Date(1),
    });
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
      clearStash: () => Promise.resolve(),
      onPathChanged: () => undefined,
      stash: () => Promise.resolve(),
      write: (_path, _content, name) => {
        expect(name).toEqual({ kind: "heading" });
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error("disk full"))
          : Promise.resolve({
              path: "weekend.md",
              revision: "r1",
              updatedAt: new Date(1),
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
    expect(await note.flush()).toBe(true);
    expect(note.store.state.path).toBe("weekend.md");
  });

  it("should not request renaming after reads, external updates, or body edits", async () => {
    const writes: unknown[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => Promise.reject(new Error("no move requested")),
      clearStash: () => Promise.resolve(),
      onPathChanged: () => undefined,
      stash: () => Promise.resolve(),
      write: (path, _content, name) => {
        writes.push(name);
        return Promise.resolve({
          path,
          revision: "r3",
          updatedAt: new Date(3),
        });
      },
    });
    await note.flush();
    expect(writes).toEqual([]);
    note.receiveFile(
      "shopping.md",
      {
        content: "# Changed elsewhere\n\nbody",
        revision: "r1",
        updatedAt: new Date(1),
      },
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
      clearStash: () => Promise.resolve(),
      onPathChanged: () => undefined,
      stash: () => Promise.resolve(),
      write: (path, _content, name) => {
        writes.push(name);
        return Promise.resolve({
          path,
          revision: "r1",
          updatedAt: new Date(1),
        });
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
          file: {
            content: initial.content,
            revision: "r1",
            updatedAt: new Date(1),
          },
          path: `${change.folder}/shopping.md`,
        });
      },
      clearStash: () => Promise.resolve(),
      onPathChanged: () => undefined,
      stash: () => Promise.resolve(),
      write: (path) =>
        Promise.resolve({ path, revision: "r1", updatedAt: new Date(1) }),
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
    const held = Promise.withResolvers<{
      path: string;
      revision: string;
      updatedAt: Date;
    }>();
    const writes: string[] = [];
    const note = createNotePersistence(initial, {
      changePath: () => Promise.reject(new Error("no move requested")),
      clearStash: () => Promise.resolve(),
      onPathChanged: () => undefined,
      stash: () => Promise.resolve(),
      write: (path, content) => {
        writes.push(content);
        return writes.length === 1
          ? held.promise
          : Promise.resolve({ path, revision: "r2", updatedAt: new Date(2) });
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
    held.resolve({
      path: "shopping.md",
      revision: "r1",
      updatedAt: new Date(1),
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
    const note = createNotePersistence(initial, {
      changePath: () => Promise.reject(new Error("no move requested")),
      clearStash: () => Promise.resolve(),
      onDocumentChanged: (content) => observed.push(content),
      onPathChanged: () => undefined,
      stash: () => Promise.resolve(),
      write: (path, content) => {
        writes.push(content);
        return Promise.resolve({
          path,
          revision: "r2",
          updatedAt: new Date(2),
        });
      },
    });
    const externalContent = "---\ntags: [external]\n---\n# Errands\n\nbody";
    note.receiveFile(
      "shopping.md",
      { content: externalContent, revision: "r1", updatedAt: new Date(1) },
      false
    );
    expect(note.store.state.content).toBe(externalContent);
    await note.flush();
    expect(writes).toEqual([]);
    expect(observed).toEqual([externalContent]);
  });
});

it("should reconcile a newer file observed during a save without receiving it twice", async () => {
  const held = Promise.withResolvers<{
    path: string;
    revision: string;
    updatedAt: Date;
  }>();
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: () => Promise.resolve(),
    onPathChanged: () => undefined,
    stash: () => Promise.resolve(),
    write: () => held.promise,
  });
  const release = note.retain();
  note.edit({ content: "# Errands\n\nlocal edit", mode: "body" });
  const saving = note.save();
  await Promise.resolve();
  note.receiveFile(
    "shopping.md",
    {
      content: "# Errands\n\nexternal edit",
      revision: "r2",
      updatedAt: new Date(2),
    },
    false
  );
  expect(note.store.state.content).toContain("local edit");
  held.resolve({ path: "shopping.md", revision: "r1", updatedAt: new Date(1) });
  await saving;
  expect(note.store.state.content).toBe("# Errands\n\nexternal edit");
  expect(note.applyHistory("undo")).toBe(false);
  await release();
});

it("should discard a deferred missing observation after the save changes the path", async () => {
  const held = Promise.withResolvers<{
    path: string;
    revision: string;
    updatedAt: Date;
  }>();
  let closed = false;
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: () => Promise.resolve(),
    onCleanFileMissing: () => {
      closed = true;
    },
    onPathChanged: () => undefined,
    stash: () => Promise.resolve(),
    write: () => held.promise,
  });
  const release = note.retain();
  const saving = note.changePath({ kind: "retitle", title: "Weekend" });
  await Promise.resolve();
  note.receiveFile("shopping.md", undefined, true);
  held.resolve({ path: "weekend.md", revision: "r1", updatedAt: new Date(1) });
  await saving;
  expect(note.store.state).toMatchObject({
    missing: false,
    path: "weekend.md",
    status: "saved",
  });
  expect(closed).toBe(false);
  await release();
});

it("should autosave native source edits and derive the tab state without a React publisher", async () => {
  vi.useFakeTimers();
  const writes: unknown[] = [];
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: () => Promise.resolve(),
    onPathChanged: () => undefined,
    stash: () => Promise.resolve(),
    write: (path, content, name) => {
      writes.push({ content, name, path });
      return Promise.resolve({
        path: "weekend.md",
        revision: "r1",
        updatedAt: new Date(1),
      });
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
    expect(writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toEqual([
      {
        content: "# Weekend\n\nbody",
        name: { kind: "heading" },
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
    expect(writes.at(-1)).toEqual({
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
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: () => Promise.resolve(),
    onPathChanged: () => undefined,
    stash: () => Promise.resolve(),
    write: (path, content) => {
      writes.push(content);
      return Promise.resolve({ path, revision: "r2", updatedAt: new Date(2) });
    },
  });
  note.edit({ content: "# Errands\n\nbody\n\nmine", mode: "body" });
  note.receiveFile(
    "shopping.md",
    { content: "# Chores\n\nbody", revision: "r1", updatedAt: new Date(1) },
    false
  );
  expect(note.store.state.content).toBe("# Chores\n\nbody\n\nmine");
  expect(note.store.state.status).toBe("dirty");
  expect(note.store.state.base.revision).toBe("r1");
  await note.flush();
  expect(writes).toEqual(["# Chores\n\nbody\n\nmine"]);
  expect(note.store.state.status).toBe("saved");
});

it("should not rename after a merged heading, and reset undo at the merge", async () => {
  const names: unknown[] = [];
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: () => Promise.resolve(),
    onPathChanged: () => undefined,
    stash: () => Promise.resolve(),
    write: (path, _content, name) => {
      names.push(name);
      return Promise.resolve({ path, revision: "r2", updatedAt: new Date(2) });
    },
  });
  note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
  note.receiveFile(
    "shopping.md",
    { content: "# Chores\n\nbody", revision: "r1", updatedAt: new Date(1) },
    false
  );
  expect(note.applyHistory("undo")).toBe(false);
  await note.flush();
  expect(names).toEqual([null]);
});

it("should take identical edits on both sides without review", () => {
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: () => Promise.resolve(),
    onPathChanged: () => undefined,
    stash: () => Promise.resolve(),
    write: () => Promise.reject(new Error("no save requested")),
  });
  note.edit({ content: "# Errands\n\nsame words", mode: "body" });
  note.receiveFile(
    "shopping.md",
    {
      content: "# Errands\n\nsame words",
      revision: "r1",
      updatedAt: new Date(1),
    },
    false
  );
  expect(note.store.state.content).toBe("# Errands\n\nsame words");
  expect(note.store.state.status).toBe("dirty");
  expect(note.store.state.theirs).toBeUndefined();
});

it("should keep newer typing when its own save echoes back", async () => {
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: () => Promise.resolve(),
    onPathChanged: () => undefined,
    stash: () => Promise.resolve(),
    write: (path) =>
      Promise.resolve({ path, revision: "r1", updatedAt: new Date(1) }),
  });
  note.edit({ content: "# Errands\n\nsaved words", mode: "body" });
  await note.flush();
  note.edit({ content: "# Errands\n\nsaved words, and more", mode: "body" });
  note.receiveFile(
    "shopping.md",
    {
      content: "# Errands\n\nsaved words",
      revision: "r1",
      updatedAt: new Date(4),
    },
    false
  );
  expect(note.store.state.content).toBe("# Errands\n\nsaved words, and more");
  expect(note.store.state.status).toBe("dirty");
  expect(note.store.state.updatedAt).toEqual(new Date(4));
});

it("should ignore a read older than its last save", async () => {
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: () => Promise.resolve(),
    onPathChanged: () => undefined,
    stash: () => Promise.resolve(),
    write: (path) =>
      Promise.resolve({ path, revision: "r1", updatedAt: new Date(5) }),
  });
  note.edit({ content: "# Errands\n\nsaved words", mode: "body" });
  await note.flush();
  note.receiveFile(
    "shopping.md",
    { content: "# Errands\n\nbody", revision: "r0", updatedAt: new Date(3) },
    false
  );
  expect(note.store.state.content).toBe("# Errands\n\nsaved words");
  expect(note.store.state.status).toBe("saved");
});

it("should pause saving and stash the review when edits overlap", async () => {
  const writes: string[] = [];
  const stashes: unknown[] = [];
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: () => Promise.resolve(),
    onPathChanged: () => undefined,
    stash: (path, stash) => {
      stashes.push({ path, stash });
      return Promise.resolve();
    },
    write: (path, content) => {
      writes.push(content);
      return Promise.resolve({ path, revision: "r2", updatedAt: new Date(2) });
    },
  });
  note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
  note.receiveFile(
    "shopping.md",
    {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    },
    false
  );
  expect(note.store.state.status).toBe("conflict");
  expect(note.store.state.content).toBe("# Errands\n\nbody, mine");
  expect(note.store.state.theirs).toEqual({
    content: "# Errands\n\nbody, on disk",
    revision: "r1",
    updatedAt: new Date(1),
  });
  expect(note.store.state.base.revision).toBe("r0");
  note.edit({ content: "# Errands\n\nbody, mine, more", mode: "body" });
  expect(note.store.state.status).toBe("conflict");
  await expect(note.flush()).resolves.toBe(true);
  expect(writes).toEqual([]);
  expect(stashes).toEqual([
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
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: () => Promise.resolve(),
    onPathChanged: () => undefined,
    stash: () => Promise.reject(new Error("the disk is full")),
    write: () => Promise.reject(new Error("no save requested")),
  });
  note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
  note.receiveFile(
    "shopping.md",
    {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    },
    false
  );
  await Promise.resolve();
  expect(note.store.state.reason).toBe("the disk is full");
  await expect(note.flush()).resolves.toBe(false);
  expect(note.store.state.status).toBe("conflict");
  await expect(note.editMetadata({ pinned: true })).rejects.toThrow(
    "the disk is full"
  );
});

it("should refuse a folder move while a review is open", async () => {
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: () => Promise.resolve(),
    onPathChanged: () => undefined,
    stash: () => Promise.resolve(),
    write: () => Promise.reject(new Error("no save requested")),
  });
  note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
  note.receiveFile(
    "shopping.md",
    {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    },
    false
  );
  await expect(
    note.changePath({ folder: "archive", kind: "move" })
  ).rejects.toThrow("this note needs review before it can move");
  expect(note.store.state.pendingPaths).toBe(0);
});

it("should note a file that changes again during review without stashing twice", async () => {
  const stashes: unknown[] = [];
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: () => Promise.resolve(),
    onPathChanged: () => undefined,
    stash: (_path, stash) => {
      stashes.push(stash.ours);
      return Promise.resolve();
    },
    write: () => Promise.reject(new Error("no save requested")),
  });
  note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
  note.receiveFile(
    "shopping.md",
    {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    },
    false
  );
  note.receiveFile(
    "shopping.md",
    {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(2),
    },
    false
  );
  expect(note.store.state.changedAgain).toBe(false);
  note.receiveFile(
    "shopping.md",
    {
      content: "# Errands\n\nbody, on disk again",
      revision: "r2",
      updatedAt: new Date(3),
    },
    false
  );
  expect(note.store.state.status).toBe("conflict");
  expect(note.store.state.changedAgain).toBe(true);
  expect(note.store.state.theirs?.revision).toBe("r2");
  await Promise.resolve();
  expect(stashes).toEqual(["# Errands\n\nbody, mine"]);
});

it("should leave review and clear the stash once a later change combines", async () => {
  const cleared: string[] = [];
  const writes: string[] = [];
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: (path) => {
      cleared.push(path);
      return Promise.resolve();
    },
    onPathChanged: () => undefined,
    stash: () => Promise.resolve(),
    write: (path, content) => {
      writes.push(content);
      return Promise.resolve({ path, revision: "r3", updatedAt: new Date(3) });
    },
  });
  note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
  note.receiveFile(
    "shopping.md",
    {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    },
    false
  );
  await Promise.resolve();
  note.receiveFile(
    "shopping.md",
    {
      content: "# Chores\n\nbody",
      revision: "r2",
      updatedAt: new Date(2),
    },
    false
  );
  expect(note.store.state.status).toBe("dirty");
  expect(note.store.state.content).toBe("# Chores\n\nbody, mine");
  await note.flush();
  expect(writes).toEqual(["# Chores\n\nbody, mine"]);
  expect(cleared).toEqual(["shopping.md"]);
  expect(note.store.state.status).toBe("saved");
});

it("should keep a committed save when its stored review cannot be removed", async () => {
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: () => Promise.reject(new Error("permission denied")),
    onPathChanged: () => undefined,
    stash: () => Promise.resolve(),
    write: (path) =>
      Promise.resolve({ path, revision: "r3", updatedAt: new Date(3) }),
  });
  note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
  note.receiveFile(
    "shopping.md",
    {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    },
    false
  );
  await Promise.resolve();
  note.receiveFile(
    "shopping.md",
    { content: "# Chores\n\nbody", revision: "r2", updatedAt: new Date(2) },
    false
  );
  await expect(note.flush()).resolves.toBe(true);
  expect(note.store.state.status).toBe("saved");
  expect(note.store.state.reason).toBe(
    "the stored review could not be removed: permission denied"
  );
});

it("should hold a pin change with the unsaved text while a review is open", async () => {
  const stashes: string[] = [];
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: () => Promise.resolve(),
    onPathChanged: () => undefined,
    stash: (_path, stash) => {
      stashes.push(stash.ours);
      return Promise.resolve();
    },
    write: () => Promise.reject(new Error("no save requested")),
  });
  note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
  note.receiveFile(
    "shopping.md",
    {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    },
    false
  );
  await note.editMetadata({ pinned: true });
  expect(note.store.state.status).toBe("conflict");
  expect(note.snapshot.state.pinned).toBe(true);
  expect(stashes.at(-1)).toBe(
    "---\npinned: true\n---\n# Errands\n\nbody, mine"
  );
});

it("should resolve a review, save the result, and clear the stored review", async () => {
  const cleared: string[] = [];
  const writes: string[] = [];
  const note = createNotePersistence(initial, {
    changePath: () => Promise.reject(new Error("no move requested")),
    clearStash: (path) => {
      cleared.push(path);
      return Promise.resolve();
    },
    onPathChanged: () => undefined,
    stash: () => Promise.resolve(),
    write: (path, content) => {
      writes.push(content);
      return Promise.resolve({ path, revision: "r2", updatedAt: new Date(2) });
    },
  });
  note.edit({ content: "# Errands\n\nbody, mine", mode: "body" });
  note.receiveFile(
    "shopping.md",
    {
      content: "# Errands\n\nbody, on disk",
      revision: "r1",
      updatedAt: new Date(1),
    },
    false
  );
  await Promise.resolve();
  expect(() => note.resolve("# Errands\n\nbody, both")).not.toThrow();
  expect(note.store.state.content).toBe("# Errands\n\nbody, both");
  expect(note.store.state.theirs).toBeUndefined();
  expect(note.applyHistory("undo")).toBe(false);
  await note.flush();
  expect(writes).toEqual(["# Errands\n\nbody, both"]);
  expect(cleared).toEqual(["shopping.md"]);
  expect(note.store.state.status).toBe("saved");
  expect(note.store.state.base.revision).toBe("r2");
  expect(() => note.resolve("again")).toThrow("nothing to review");
});
