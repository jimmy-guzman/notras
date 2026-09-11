import { useSelector } from "@tanstack/react-store";
import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { createNotePersistence } from "@/components/editor/note-persistence";
import { parseNote } from "@/core/frontmatter";
import {
  closeTab,
  getTabState,
  openNote,
  registerTabHandles,
} from "@/lib/tabs/store";
import { useNoteTags } from "./use-note-tags";

it("should preserve successive tag edits before a rerender or save completes", async ({
  onTestFinished,
}) => {
  const held = Promise.withResolvers<{ path: string; updatedAt: Date }>();
  const writes: string[] = [];
  const note = createNotePersistence(
    {
      content:
        "---\npinned: true\ntags: [kept, removed]\n---\n# Errands\n\nbody",
      kind: "note",
      path: "errands.md",
      updatedAt: new Date(0),
    },
    {
      changePath: () => Promise.reject(new Error("no move requested")),
      onPathChanged: () => undefined,
      write: (_path, content) => {
        writes.push(content);
        return held.promise;
      },
    }
  );
  openNote("errands.md");
  const id = getTabState().activeId;
  registerTabHandles(id, {
    editMetadata: note.editMetadata,
    getCaret: () => 0,
    insertText: () => undefined,
    toggleSource: () => undefined,
  });
  const { result } = renderHook(() => {
    const state = useSelector(note.store);
    return useNoteTags(state.path, parseNote(state.content).frontmatter.tags);
  });
  onTestFinished(() => closeTab(id));
  const changing: Promise<void>[] = [];
  act(() => {
    const { changeTags } = result.current;
    changing.push(changeTags((current) => [...current, "first"]));
    changing.push(changeTags((current) => [...current, "second"]));
    changing.push(
      changeTags((current) => current.filter((tag) => tag !== "removed"))
    );
    changing.push(changeTags((current) => [...current, "temporary"]));
    expect(parseNote(note.store.state.content).frontmatter.tags).toContain(
      "temporary"
    );
    changing.push(
      changeTags((current) => current.filter((tag) => tag !== "temporary"))
    );
  });
  expect(parseNote(note.store.state.content).frontmatter.tags).toEqual([
    "kept",
    "first",
    "second",
  ]);
  await act(async () => {
    held.resolve({ path: "errands.md", updatedAt: new Date(1) });
    await Promise.all(changing);
  });
  expect(parseNote(writes.at(-1) ?? "").frontmatter.tags).toEqual([
    "kept",
    "first",
    "second",
  ]);
  expect(parseNote(note.store.state.content).frontmatter.pinned).toBe(true);
  expect(parseNote(note.store.state.content).body).toBe("# Errands\n\nbody");
});

it("should edit the live document and keep the chosen tags when saving fails", async ({
  onTestFinished,
}) => {
  const held = Promise.withResolvers<{ path: string; updatedAt: Date }>();
  const note = createNotePersistence(
    {
      content: "---\ntags: [kept]\n---\n# Errands\n\nbody",
      kind: "note",
      path: "errands.md",
      updatedAt: new Date(0),
    },
    {
      changePath: () => Promise.reject(new Error("no move requested")),
      onPathChanged: () => undefined,
      write: () => held.promise,
    }
  );
  openNote("errands.md");
  const id = getTabState().activeId;
  registerTabHandles(id, {
    editMetadata: note.editMetadata,
    getCaret: () => 0,
    insertText: () => undefined,
    toggleSource: () => undefined,
  });
  const { result } = renderHook(() => {
    const state = useSelector(note.store);
    return useNoteTags(state.path, parseNote(state.content).frontmatter.tags);
  });
  onTestFinished(() => closeTab(id));
  let changing: Promise<void> | undefined;
  act(() => {
    changing = result.current.changeTags((current) => [...current, "added"]);
  });
  expect(parseNote(note.store.state.content).frontmatter.tags).toEqual([
    "kept",
    "added",
  ]);
  await act(async () => {
    held.reject(new Error("disk full"));
    await changing;
  });
  expect(parseNote(note.store.state.content).frontmatter.tags).toEqual([
    "kept",
    "added",
  ]);
  expect(note.store.state.status).toBe("failed");
});
