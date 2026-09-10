import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { Editor as TiptapEditor } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileError } from "@/core/errors";
import { getNote } from "@/data/get-note";
import { noteQueries, notesDirQuery } from "@/data/queries";
import { flushPendingWrites } from "@/lib/pending-flush";
import { closeTab, getTabHandles, getTabState } from "@/lib/tabs/store";
import { tabPanelId } from "@/lib/tabs/tab";

import { NoteSession } from "./note-session";

// The furthest boundary a component test can reach: below this sit the Effect
// runtime and a Tauri command, neither of which exists here.
vi.mock("@/data/get-note", () => ({ getNote: vi.fn() }));

// `act` refuses to run without this, and no setup file exists to set it.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const tab = { id: "t1", kind: "note", path: "a.md" } as const;

const roots: Root[] = [];

/** Mount one session in a real root, the way `use-note-tags.spec.ts` does. */
function mountSession(content?: string) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  if (content !== undefined) {
    client.setQueryData(noteQueries.fileKey("note", tab.path), {
      content,
      pinned: false,
      tags: [],
      updatedAt: new Date(1),
    });
    client.setQueryData(noteQueries.list().queryKey, []);
    client.setQueryData(notesDirQuery.queryKey, "/notes");
  }
  const container = document.createElement("div");

  document.body.append(container);

  const root = createRoot(container);

  roots.push(root);
  act(() => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(NoteSession, { active: true, tab })
      )
    );
  });
  return client;
}

/**
 * Let the read reject and React commit what follows. Bounded polling rather
 * than one tick, since under a loaded suite the rejection can take several.
 */
async function settle() {
  for (let tick = 0; tick < 40 && panel() === null; tick += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll has to let one tick finish before it looks at the DOM again
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
    });
  }
}

function panel() {
  return document.getElementById(tabPanelId(tab.id));
}

async function editor(id: string = tab.id) {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
  const surface = document
    .getElementById(tabPanelId(id))
    ?.querySelector(".ProseMirror");
  if (
    surface === undefined ||
    surface === null ||
    !("editor" in surface) ||
    !(surface.editor instanceof TiptapEditor)
  ) {
    throw new Error("the editor did not mount");
  }
  return surface.editor;
}

function sessionHandles(id: string = tab.id) {
  const handles = getTabHandles(id);
  if (handles === undefined) {
    throw new Error("the session did not mount");
  }
  return handles;
}

describe("NoteSession", () => {
  beforeEach(() => {
    vi.mocked(getNote).mockReset();
    vi.mocked(getNote).mockRejectedValue(
      new FileError({
        kind: "failed",
        message: "permission denied",
      })
    );
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => {
        root.unmount();
      });
    }
    for (const entry of getTabState().tabs) {
      closeTab(entry.id);
    }
    clearMocks();
    document.body.innerHTML = "";
  });

  it.each([false, true])(
    "should undo a rename across saving and editor mode changes from source mode %s",
    async (sourceMode) => {
      const writes: unknown[] = [];
      const held = Promise.withResolvers<{
        path: string;
        updatedAt: number;
        warnings: never[];
      }>();
      mockIPC((command, args) => {
        if (command !== "save_note") {
          return;
        }
        writes.push(args);
        return writes.length === 1
          ? held.promise
          : { path: "a.md", updatedAt: 3, warnings: [] };
      });
      mountSession("# Errands\n\nbody");
      await editor();
      if (sourceMode) {
        act(() => sessionHandles().toggleSource());
      }
      const surface = await editor();
      const { changePath } = sessionHandles();
      if (changePath === undefined) {
        throw new Error("the session has no rename action");
      }
      let renaming: Promise<void> | undefined;
      act(() => {
        renaming = changePath({ kind: "retitle", title: "Weekend errands" });
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(surface.state.doc.textContent).toContain("Weekend errands");
      act(() => {
        surface.commands.setTextSelection(surface.state.doc.content.size - 1);
        surface.commands.insertContent(" plus typing");
      });
      const selection = surface.state.selection.from;
      await act(async () => {
        held.resolve({
          path: "weekend-errands-2.md",
          updatedAt: 2,
          warnings: [],
        });
        await renaming;
      });
      expect(await editor()).toBe(surface);
      expect(surface.state.selection.from).toBe(selection);
      expect(surface.state.doc.textContent).toContain("plus typing");
      act(() => {
        surface.commands.undo();
      });
      expect(surface.state.doc.textContent).not.toContain("plus typing");
      expect(surface.state.doc.textContent).toContain("Weekend errands");
      act(() => sessionHandles().toggleSource());
      const other = await editor();
      act(() => {
        other.commands.undo();
      });
      expect(other.state.doc.textContent).toContain("Errands");
      expect(other.state.doc.textContent).not.toContain("Weekend");
      await act(async () => {
        expect(await flushPendingWrites()).toBe(true);
      });
      expect(writes.at(-1)).toEqual({
        content: "# Errands\n\nbody",
        name: { kind: "filename", value: "a.md" },
        path: "weekend-errands-2.md",
      });
      act(() => {
        other.commands.redo();
      });
      expect(other.state.doc.textContent).toContain("Weekend errands");
      await act(async () => {
        await flushPendingWrites();
      });
    }
  );

  it.each([false, true])(
    "should rename for a heading touch even when its final text is unchanged in source mode %s",
    async (sourceMode) => {
      const writes: unknown[] = [];
      mockIPC((command, args) => {
        if (command === "save_note") {
          writes.push(args);
          return { path: "errands.md", updatedAt: 2, warnings: [] };
        }
      });
      mountSession("# Errands\n\nbody");
      await editor();
      if (sourceMode) {
        act(() => sessionHandles().toggleSource());
      }
      const surface = await editor();
      act(() => {
        const position = sourceMode ? 10 : 8;
        surface.commands.setTextSelection(position);
        surface
          .chain()
          .insertContent(" ")
          .deleteRange({ from: position, to: position + 1 })
          .run();
      });
      await act(async () => {
        await flushPendingWrites();
      });
      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatchObject({
        name: { kind: "heading" },
        path: "a.md",
      });
    }
  );

  it("should recompute the filename when formatting changes the heading", async () => {
    const writes: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "save_note") {
        writes.push(args);
        return { path: "errands.md", updatedAt: 2, warnings: [] };
      }
    });
    mountSession("# Errands\n\nbody");
    const surface = await editor();
    act(() => {
      surface.chain().setTextSelection({ from: 1, to: 8 }).toggleBold().run();
    });
    await act(async () => {
      await flushPendingWrites();
    });
    expect(writes.at(-1)).toMatchObject({ name: { kind: "heading" } });
  });

  it("should save the complete document from either editor mode", async () => {
    const writes: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "save_note") {
        writes.push(args);
        return { path: tab.path, updatedAt: 2, warnings: [] };
      }
    });
    mountSession("---\ntags: [old]\n---\nbody");
    await editor();
    act(() => {
      sessionHandles().toggleSource();
    });
    const source = await editor();
    act(() => {
      source.commands.selectAll();
      source.commands.insertContent("---\ntags: [edited]\n---\nbody");
    });
    act(() => {
      sessionHandles().toggleSource();
    });
    const rich = await editor();
    act(() => {
      rich.commands.setTextSelection(rich.state.doc.content.size - 1);
      rich.commands.insertContent(" plus typing");
    });
    await act(async () => {
      expect(await flushPendingWrites()).toBe(true);
    });
    expect(writes).toEqual([
      {
        content: "---\ntags: [edited]\n---\nbody plus typing",
        name: null,
        path: "a.md",
      },
    ]);
    act(() => {
      rich.commands.insertContent(" again");
    });
    await act(async () => {
      expect(await flushPendingWrites()).toBe(true);
    });
    expect(writes.at(-1)).toEqual({
      content: "---\ntags: [edited]\n---\nbody plus typing again",
      name: null,
      path: "a.md",
    });
  });

  it("should keep newer source edits while an earlier save is in flight", async () => {
    const first = Promise.withResolvers<{
      path: string;
      updatedAt: number;
      warnings: [];
    }>();
    const writes: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "save_note") {
        writes.push(args);
        return writes.length === 1
          ? first.promise
          : { path: tab.path, updatedAt: 3, warnings: [] };
      }
    });
    mountSession("body");
    await editor();
    act(() => {
      sessionHandles().toggleSource();
    });
    const source = await editor();
    act(() => {
      source.commands.selectAll();
      source.commands.insertContent("---\ntags: [first]\n---\nbody");
    });
    const flushing = flushPendingWrites();
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      source.commands.selectAll();
      source.commands.insertContent("---\ntags: [second]\n---\nbody");
    });
    act(() => {
      sessionHandles().toggleSource();
    });
    const rich = await editor();
    act(() => {
      rich.commands.setTextSelection(rich.state.doc.content.size - 1);
      rich.commands.insertContent(" later");
    });
    await act(async () => {
      first.resolve({ path: tab.path, updatedAt: 2, warnings: [] });
      expect(await flushing).toBe(true);
    });
    expect(writes).toEqual([
      {
        content: "---\ntags: [first]\n---\nbody",
        name: null,
        path: "a.md",
      },
      {
        content: "---\ntags: [second]\n---\nbody later",
        name: null,
        path: "a.md",
      },
    ]);
  });

  it("should show why the first read failed and offer to try again", async () => {
    mountSession();
    await settle();

    expect(panel()?.getAttribute("role")).toBe("tabpanel");
    expect(panel()?.textContent).toContain("could not read this note");
    expect(panel()?.textContent).toContain("permission denied");
    expect(panel()?.querySelector("button")?.textContent).toBe("try again");
  });

  it("should read again when asked", async () => {
    mountSession();
    await settle();

    await act(async () => {
      panel()?.querySelector("button")?.click();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    await settle();

    expect(getNote).toHaveBeenCalledTimes(2);
    expect(panel()?.textContent).toContain("could not read this note");
  });
});
