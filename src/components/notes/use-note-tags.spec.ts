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
    changing = result.current.changeTags(["kept", "added"]);
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
