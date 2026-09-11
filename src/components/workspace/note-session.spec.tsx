import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor as TiptapEditor } from "@tiptap/core";
import { createElement, StrictMode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";

import { Toaster } from "@/components/ui/toast";
import { FileError } from "@/core/errors";
import { getNote } from "@/data/get-note";
import { noteQueries, notesDirQuery } from "@/data/queries";
import { flushPendingWrites } from "@/lib/pending-flush";
import {
  activateTab,
  closeTab,
  getTabHandles,
  getTabState,
  moveTab,
  openNote,
} from "@/lib/tabs/store";
import { tabPanelId } from "@/lib/tabs/tab";

import { NoteSession } from "./note-session";

vi.mock("@/data/get-note", () => ({ getNote: vi.fn() }));

const tab = { id: "t1", kind: "note", path: "a.md" } as const;

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

  render(
    createElement(
      StrictMode,
      null,
      createElement(
        QueryClientProvider,
        { client },
        createElement(NoteSession, { active: true, tab })
      )
    )
  );
  return client;
}

async function settle() {
  await waitFor(() => expect(panel()).toBeInTheDocument());
}

function panel() {
  return document.getElementById(tabPanelId(tab.id));
}

async function editor(id: string = tab.id) {
  await waitFor(() =>
    expect(
      document.getElementById(tabPanelId(id))?.querySelector(".ProseMirror")
    ).toBeInTheDocument()
  );
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
    cleanup();
    for (const entry of getTabState().tabs) {
      closeTab(entry.id);
    }
    clearMocks();
  });

  it("should edit and retain history while the note list is pending", async () => {
    const listed = Promise.withResolvers<[]>();
    const writes: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "list_notes") {
        return listed.promise;
      }
      if (command === "save_note") {
        writes.push(args);
        return { path: "a.md", updatedAt: 2, warnings: [] };
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    client.setQueryData(noteQueries.fileKey("note", "a.md"), {
      content: "# Available\n\nOriginal text",
      pinned: false,
      tags: [],
      updatedAt: new Date(1),
    });
    onTestFinished(async () => {
      await act(() => {
        listed.resolve([]);
      });
      client.clear();
    });
    render(
      <QueryClientProvider client={client}>
        <NoteSession active tab={tab} />
      </QueryClientProvider>
    );

    const liveEditor = await editor();
    await act(() => {
      liveEditor.commands.insertContent("Typed ");
    });
    await act(async () => {
      await flushPendingWrites();
    });
    expect(writes).toHaveLength(1);
    await act(() => {
      listed.resolve([]);
    });
    expect(await editor()).toBe(liveEditor);
    await act(() => {
      liveEditor.commands.undo();
    });
    expect(liveEditor.getText()).not.toContain("Typed");
  });

  it("should report a failed pending link lookup without treating the destination as missing", async () => {
    const listed = Promise.withResolvers<[]>();
    mockIPC((command) => {
      if (command === "list_notes") {
        return listed.promise;
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    client.setQueryData(noteQueries.fileKey("note", "a.md"), {
      content: "# Available\n\n[Target](target.md)",
      pinned: false,
      tags: [],
      updatedAt: new Date(1),
    });
    onTestFinished(async () => {
      await act(() => {
        listed.resolve([]);
      });
      client.clear();
    });
    render(
      <QueryClientProvider client={client}>
        <NoteSession active tab={tab} />
        <Toaster />
      </QueryClientProvider>
    );
    const liveEditor = await editor();
    await act(() => {
      liveEditor.commands.setTextSelection(
        liveEditor.state.doc.content.size - 2
      );
      liveEditor.commands.keyboardShortcut("Mod-Shift-o");
    });
    expect(screen.queryByText("no note at target.md")).not.toBeInTheDocument();
    expect(screen.queryByText("could not open note")).not.toBeInTheDocument();
    await act(() => {
      listed.reject({ kind: "failed", message: "index unavailable" });
    });
    expect(await screen.findByText("could not open note")).toBeInTheDocument();
    expect(screen.getByText("index unavailable")).toBeInTheDocument();
    expect(screen.queryByText("no note at target.md")).not.toBeInTheDocument();
    expect(await editor()).toBe(liveEditor);
  });

  it.each([
    { change: "switching tabs", completion: "resolve" },
    { change: "switching tabs", completion: "reject" },
    { change: "switching away and back", completion: "resolve" },
    { change: "switching away and back", completion: "reject" },
    { change: "closing the session", completion: "resolve" },
    { change: "closing the session", completion: "reject" },
  ])(
    "should ignore a delayed link $completion after $change",
    async ({ change, completion }) => {
      const listed = Promise.withResolvers<unknown[]>();
      mockIPC((command) => {
        if (command === "list_notes") {
          return listed.promise;
        }
        throw new Error(`unexpected command: ${command}`);
      });
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
        },
      });
      client.setQueryData(notesDirQuery.queryKey, "/notes");
      client.setQueryData(noteQueries.fileKey("note", "a.md"), {
        content: "# Available\n\n[Target](target.md)",
        pinned: false,
        tags: [],
        updatedAt: new Date(1),
      });
      onTestFinished(async () => {
        await act(() => {
          listed.resolve([]);
        });
        client.clear();
      });
      render(<Toaster />);
      const session = render(
        <QueryClientProvider client={client}>
          <NoteSession active tab={tab} />
        </QueryClientProvider>
      );
      const liveEditor = await editor();
      await act(() => {
        liveEditor.commands.setTextSelection(
          liveEditor.state.doc.content.size - 2
        );
        liveEditor.commands.keyboardShortcut("Mod-Shift-o");
      });
      if (change === "switching tabs") {
        await act(() => {
          openNote("chosen.md");
        });
      } else if (change === "switching away and back") {
        await act(() => {
          openNote("chosen.md");
        });
        session.rerender(
          <QueryClientProvider client={client}>
            <NoteSession active={false} tab={tab} />
          </QueryClientProvider>
        );
        await act(() => {
          closeTab(getTabState().activeId);
        });
        session.rerender(
          <QueryClientProvider client={client}>
            <NoteSession active tab={tab} />
          </QueryClientProvider>
        );
      } else {
        session.unmount();
      }
      await act(() => {
        if (completion === "reject") {
          listed.reject({ kind: "failed", message: "lookup unavailable" });
        } else {
          listed.resolve([
            {
              createdAt: 1,
              folder: "",
              path: "target.md",
              pinned: false,
              snippet: null,
              tags: [],
              title: "Target",
              updatedAt: 1,
            },
          ]);
        }
      });
      expect(getTabState().tabs.map((entry) => entry.path)).toEqual(
        change === "switching tabs" ? ["chosen.md"] : []
      );
      expect(screen.queryByText("lookup unavailable")).not.toBeInTheDocument();
    }
  );

  it.each([
    { change: "closing a background tab", completion: "resolve" },
    { change: "closing a background tab", completion: "reject" },
    { change: "reordering tabs", completion: "resolve" },
    { change: "reordering tabs", completion: "reject" },
    {
      change: "opening a tab while keeping the origin active",
      completion: "resolve",
    },
    {
      change: "opening a tab while keeping the origin active",
      completion: "reject",
    },
  ])(
    "should retain a pending link $completion after $change",
    async ({ change, completion }) => {
      openNote("background.md", true);
      const background = getTabState().activeId;
      openNote("a.md", true);
      const origin = getTabState().tabs.find(
        (entry) => entry.id === getTabState().activeId
      );
      if (origin === undefined) {
        throw new Error("the originating tab did not open");
      }
      const listed = Promise.withResolvers<unknown[]>();
      mockIPC((command) => {
        if (command === "list_notes") {
          return listed.promise;
        }
        throw new Error(`unexpected command: ${command}`);
      });
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
        },
      });
      client.setQueryData(notesDirQuery.queryKey, "/notes");
      client.setQueryData(noteQueries.fileKey("note", "a.md"), {
        content: "# Available\n\n[Target](target.md)",
        pinned: false,
        tags: [],
        updatedAt: new Date(1),
      });
      onTestFinished(async () => {
        await act(() => {
          listed.resolve([]);
        });
        client.clear();
      });
      render(
        <QueryClientProvider client={client}>
          <NoteSession active tab={origin} />
          <Toaster />
        </QueryClientProvider>
      );
      const liveEditor = await editor(origin.id);
      await act(() => {
        liveEditor.commands.setTextSelection(
          liveEditor.state.doc.content.size - 2
        );
        liveEditor.commands.keyboardShortcut("Mod-Shift-o");
      });
      await act(() => {
        if (change === "closing a background tab") {
          closeTab(background);
        } else if (change === "reordering tabs") {
          moveTab(background, 1);
        } else {
          openNote("another.md", true);
          activateTab(origin.id);
        }
      });
      await act(() => {
        if (completion === "reject") {
          listed.reject({ kind: "failed", message: "lookup unavailable" });
        } else {
          listed.resolve([
            {
              createdAt: 1,
              folder: "",
              path: "target.md",
              pinned: false,
              snippet: null,
              tags: [],
              title: "Target",
              updatedAt: 1,
            },
          ]);
        }
      });
      expect(
        getTabState().tabs.find((entry) => entry.id === getTabState().activeId)
          ?.path
      ).toBe(completion === "resolve" ? "target.md" : "a.md");
      if (completion === "reject") {
        expect(
          await screen.findByText("lookup unavailable")
        ).toBeInTheDocument();
      }
    }
  );

  it("should follow only the most recently activated link while its lookup is pending", async () => {
    const listed = Promise.withResolvers<unknown[]>();
    mockIPC((command) => {
      if (command === "list_notes") {
        return listed.promise;
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    client.setQueryData(noteQueries.fileKey("note", "a.md"), {
      content: "# Available\n\n[First](first.md) [Second](second.md)",
      pinned: false,
      tags: [],
      updatedAt: new Date(1),
    });
    onTestFinished(async () => {
      await act(() => {
        listed.resolve([]);
      });
      client.clear();
    });
    render(
      <QueryClientProvider client={client}>
        <NoteSession active tab={tab} />
      </QueryClientProvider>
    );
    const liveEditor = await editor();
    await act(() => {
      liveEditor.commands.setTextSelection(13);
      liveEditor.commands.keyboardShortcut("Mod-Shift-o");
      liveEditor.commands.setTextSelection(
        liveEditor.state.doc.content.size - 2
      );
      liveEditor.commands.keyboardShortcut("Mod-Shift-o");
    });
    await act(() => {
      listed.resolve([
        {
          createdAt: 1,
          folder: "",
          path: "first.md",
          pinned: false,
          snippet: null,
          tags: [],
          title: "First",
          updatedAt: 1,
        },
        {
          createdAt: 1,
          folder: "",
          path: "second.md",
          pinned: false,
          snippet: null,
          tags: [],
          title: "Second",
          updatedAt: 1,
        },
      ]);
    });
    expect(getTabState().tabs.map((entry) => entry.path)).toEqual([
      "second.md",
    ]);
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

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "try again" }));
    await settle();

    await waitFor(() => expect(getNote).toHaveBeenCalledTimes(2));
    expect(panel()?.textContent).toContain("could not read this note");
  });

  it("should retain source spelling and undo through repeated rich and source switches", async () => {
    const writes: string[] = [];
    mockIPC((command, args) => {
      if (command === "save_note") {
        if (
          args === undefined ||
          !("content" in args) ||
          typeof args.content !== "string"
        ) {
          throw new Error("save content missing");
        }
        writes.push(args.content);
        return { path: "a.md", updatedAt: 2, warnings: [] };
      }
    });
    mountSession("*hello*");
    await editor();
    act(() => sessionHandles().toggleSource());
    const source = await editor();
    act(() => {
      source.commands.selectAll();
      source.commands.insertContent("_hello_");
    });
    act(() => sessionHandles().toggleSource());
    await editor();
    act(() => sessionHandles().toggleSource());
    const remounted = await editor();
    expect(remounted.state.doc.textContent).toBe("_hello_");
    act(() => remounted.commands.undo());
    expect(remounted.state.doc.textContent).toBe("*hello*");
    act(() => remounted.commands.redo());
    await act(async () => {
      await flushPendingWrites();
    });
    expect(writes.at(-1)).toBe("_hello_");
  });
});
