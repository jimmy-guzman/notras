import { describe, expect, it } from "vitest";

import { createNotePersistence } from "@/components/editor/note-persistence";
import type { SaveOutcome } from "@/components/editor/note-persistence";
import { parseNote } from "@/core/frontmatter";
import {
  closeTab,
  getTabState,
  openNote,
  registerTabHandles,
} from "@/lib/tabs/store";

import { changeNoteTags } from "./change-note-tags";

describe("change note tags", () => {
  it("should preserve successive tag edits before a rerender or save completes", async ({
    onTestFinished,
  }) => {
    const held = Promise.withResolvers<SaveOutcome>();
    const writes: string[] = [];
    const note = createNotePersistence(
      {
        content:
          "---\npinned: true\ntags: [kept, removed]\n---\n# Errands\n\nbody",
        path: "errands.md",
        revision: "r0",
        updatedAt: new Date(0),
      },
      {
        changePath: () => {
          throw new Error("no move requested");
        },
        clearStash: async () => {},
        onPathChanged: () => {},
        stash: async () => {},
        write: async (_path, content) => {
          writes.push(content);
          return await held.promise;
        },
      }
    );
    openNote("errands.md");
    const id = getTabState().activeId;
    registerTabHandles(id, {
      editMetadata: note.editMetadata,
      getCaret: () => 0,
      insertText: () => {},
      toggleSource: () => {},
    });
    const changeTags = async (update: (current: string[]) => string[]) => {
      await changeNoteTags(note.store.state.path, update);
    };
    onTestFinished(() => {
      closeTab(id);
    });
    const changing: Promise<void>[] = [];
    changing.push(
      changeTags((current) => [...current, "first"]),
      changeTags((current) => [...current, "second"]),
      changeTags((current) => current.filter((tag) => tag !== "removed")),
      changeTags((current) => [...current, "temporary"])
    );
    expect(parseNote(note.store.state.content).frontmatter.tags).toContain(
      "temporary"
    );
    changing.push(
      changeTags((current) => current.filter((tag) => tag !== "temporary"))
    );
    expect(parseNote(note.store.state.content).frontmatter.tags).toStrictEqual([
      "kept",
      "first",
      "second",
    ]);
    held.resolve({
      kind: "committed",
      receipt: { path: "errands.md", revision: "r1", updatedAt: new Date(1) },
    });
    await Promise.all(changing);
    expect(parseNote(writes.at(-1) ?? "").frontmatter.tags).toStrictEqual([
      "kept",
      "first",
      "second",
    ]);
    expect(parseNote(note.store.state.content).frontmatter.pinned).toBeTruthy();
    expect(parseNote(note.store.state.content).body).toBe("# Errands\n\nbody");
  });

  it("should edit the live document and keep the chosen tags when saving fails", async ({
    onTestFinished,
  }) => {
    const held = Promise.withResolvers<SaveOutcome>();
    const note = createNotePersistence(
      {
        content: "---\ntags: [kept]\n---\n# Errands\n\nbody",
        path: "errands.md",
        revision: "r0",
        updatedAt: new Date(0),
      },
      {
        changePath: () => {
          throw new Error("no move requested");
        },
        clearStash: async () => {},
        onPathChanged: () => {},
        stash: async () => {},
        write: async () => await held.promise,
      }
    );
    openNote("errands.md");
    const id = getTabState().activeId;
    registerTabHandles(id, {
      editMetadata: note.editMetadata,
      getCaret: () => 0,
      insertText: () => {},
      toggleSource: () => {},
    });
    const changeTags = async (update: (current: string[]) => string[]) => {
      await changeNoteTags(note.store.state.path, update);
    };
    onTestFinished(() => {
      closeTab(id);
    });
    const changing = changeTags((current) => [...current, "added"]);
    expect(parseNote(note.store.state.content).frontmatter.tags).toStrictEqual([
      "kept",
      "added",
    ]);
    held.reject(new Error("disk full"));
    await changing;
    expect(parseNote(note.store.state.content).frontmatter.tags).toStrictEqual([
      "kept",
      "added",
    ]);
    expect(note.store.state.status).toBe("failed");
  });
});
