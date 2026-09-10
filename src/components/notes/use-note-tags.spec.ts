import { useSelector } from "@tanstack/react-store";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
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

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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
  let changeTags: ((tags: string[]) => Promise<void>) | undefined;
  const root = createRoot(document.createElement("div"));
  function Probe() {
    const state = useSelector(note.store);
    const tags = useNoteTags(
      state.path,
      parseNote(state.content).frontmatter.tags
    );
    ({ changeTags } = tags);
    return createElement("span", null, tags.tags.join(","));
  }
  onTestFinished(() => {
    act(() => root.unmount());
    closeTab(id);
  });
  act(() => root.render(createElement(Probe)));
  if (changeTags === undefined) {
    throw new Error("the tags did not mount");
  }
  let changing: Promise<void> | undefined;
  act(() => {
    changing = changeTags?.(["kept", "added"]);
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
