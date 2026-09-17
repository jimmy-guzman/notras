import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { clearMocks, mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
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

import { TabStrip } from "@/components/tabs/tab-strip";
import { Toaster } from "@/components/ui/toast";
import type { ConflictStash } from "@/data/conflict-stash";
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

function savesContent(
  args: InvokeArgs | undefined
): args is { content: string } {
  return (
    args !== undefined && "content" in args && typeof args.content === "string"
  );
}

const NOOP = () => {};

const tab = { id: "t1", kind: "note", path: "a.md" } as const;
const UNFOLDED_CONTEXT = /# Errands\s+one\s+two/u;

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
      revision: "r0",
      tags: [],
      updatedAt: new Date(1),
    });
    client.setQueryData(noteQueries.list().queryKey, []);
    client.setQueryData(noteQueries.conflict("note", tab.path).queryKey, null);
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

function panel() {
  return document.querySelector(`[id="${tabPanelId(tab.id)}"]`);
}

async function settle() {
  await waitFor(() => expect(panel()).toBeInTheDocument());
}

async function editor(id: string = tab.id) {
  await waitFor(() =>
    expect(
      document
        .querySelector(`[id="${tabPanelId(id)}"]`)
        ?.querySelector(".ProseMirror")
    ).toBeInTheDocument()
  );
  const surface = document
    .querySelector(`[id="${tabPanelId(id)}"]`)
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

/**
 * Type at the end of the note's text. A bare "end" would land in the empty
 * paragraph the trailing-node extension appends after a note that ends in a
 * heading.
 */
function typeAtEnd(liveEditor: TiptapEditor, text: string) {
  let end = 0;
  liveEditor.state.doc.descendants((node, pos) => {
    if (node.isTextblock && node.textContent !== "") {
      end = pos + node.nodeSize - 1;
    }
  });
  liveEditor.chain().focus(end).insertContent(text).run();
}

function sessionHandles(id: string = tab.id) {
  const handles = getTabHandles(id);
  if (handles === undefined) {
    throw new Error("the session did not mount");
  }
  return handles;
}

function review() {
  return screen.queryByRole("region", { name: "review overlapping edits" });
}

describe(NoteSession, () => {
  let reads = 0;
  beforeEach(() => {
    reads = 0;
    const denied = vi.fn<() => Promise<never>>().mockRejectedValue({
      kind: "failed",
      message: "Permission denied",
    });
    mockIPC(async (command) => {
      if (command === "read_note") {
        reads += 1;
        return await denied();
      }
      throw new Error(`unexpected command: ${command}`);
    });
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
    mockIPC(async (command, args) => {
      if (command === "list_notes") {
        return await listed.promise;
      }
      if (command === "save_note") {
        writes.push(args);
        return {
          kind: "committed",
          receipt: { path: "a.md", revision: "r2", updatedAt: 2, warnings: [] },
        };
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    client.setQueryData(noteQueries.conflict("note", "a.md").queryKey, null);
    client.setQueryData(noteQueries.fileKey("note", "a.md"), {
      content: "# Available\n\nOriginal text",
      pinned: false,
      tags: [],
      updatedAt: new Date(1),
    });
    onTestFinished(async () => {
      act(() => {
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
    act(() => {
      typeAtEnd(liveEditor, "Typed ");
    });
    await act(async () => {
      await flushPendingWrites();
    });
    expect(writes).toHaveLength(1);
    act(() => {
      listed.resolve([]);
    });
    await expect(editor()).resolves.toBe(liveEditor);
    act(() => {
      liveEditor.commands.undo();
    });
    expect(liveEditor.getText()).not.toContain("Typed");
  });

  it("should open a file link through the note that holds it", async () => {
    const opened: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "open_linked_file") {
        opened.push(args);
        return null;
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    client.setQueryData(noteQueries.list().queryKey, []);
    client.setQueryData(
      noteQueries.conflict("note", "projects/a.md").queryKey,
      null
    );
    client.setQueryData(noteQueries.fileKey("note", "projects/a.md"), {
      content: "# A\n\n[spec](../docs/my%20spec.pdf)",
      pinned: false,
      tags: [],
      updatedAt: new Date(1),
    });
    onTestFinished(() => {
      client.clear();
    });
    render(
      <QueryClientProvider client={client}>
        <NoteSession
          active
          tab={{ id: "t3", kind: "note", path: "projects/a.md" }}
        />
        <Toaster />
      </QueryClientProvider>
    );
    const liveEditor = await editor("t3");
    act(() => {
      liveEditor.commands.setTextSelection(
        liveEditor.state.doc.content.size - 2
      );
      liveEditor.commands.keyboardShortcut("Mod-Shift-o");
    });
    await waitFor(() => {
      expect(opened).toStrictEqual([
        { destination: "../docs/my%20spec.pdf", from: "projects/a.md" },
      ]);
    });
    expect(screen.queryByText("could not open file")).not.toBeInTheDocument();
  });

  it("should report a file link the library refused with its reason", async () => {
    const missing = vi.fn<() => Promise<never>>().mockRejectedValue({
      kind: "not-found",
      message: "No such file",
    });
    mockIPC(async (command) => {
      if (command === "open_linked_file") {
        return await missing();
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    client.setQueryData(noteQueries.list().queryKey, []);
    client.setQueryData(noteQueries.conflict("note", "a.md").queryKey, null);
    client.setQueryData(noteQueries.fileKey("note", "a.md"), {
      content: "# A\n\n[spec](docs/spec.pdf)",
      pinned: false,
      tags: [],
      updatedAt: new Date(1),
    });
    onTestFinished(() => {
      client.clear();
    });
    render(
      <QueryClientProvider client={client}>
        <NoteSession active tab={tab} />
        <Toaster />
      </QueryClientProvider>
    );
    const liveEditor = await editor();
    act(() => {
      liveEditor.commands.setTextSelection(
        liveEditor.state.doc.content.size - 2
      );
      liveEditor.commands.keyboardShortcut("Mod-Shift-o");
    });
    expect(await screen.findByText("could not open file")).toBeInTheDocument();
    expect(screen.getByText("No such file")).toBeInTheDocument();
  });

  it("should open a file link from an external tab against the file", async () => {
    const opened: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "open_external_file") {
        opened.push(args);
        return null;
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    const path = "/Users/me/docs/note.md";
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    client.setQueryData(noteQueries.conflict("external", path).queryKey, null);
    client.setQueryData(noteQueries.fileKey("external", path), {
      content: "# Ext\n\n[spec](./spec.pdf)",
      pinned: false,
      tags: [],
      updatedAt: new Date(1),
    });
    onTestFinished(() => {
      client.clear();
    });
    render(
      <QueryClientProvider client={client}>
        <NoteSession active tab={{ id: "t4", kind: "external", path }} />
        <Toaster />
      </QueryClientProvider>
    );
    const liveEditor = await editor("t4");
    act(() => {
      liveEditor.commands.setTextSelection(
        liveEditor.state.doc.content.size - 2
      );
      liveEditor.commands.keyboardShortcut("Mod-Shift-o");
    });
    await waitFor(() => {
      expect(opened).toStrictEqual([
        { destination: "./spec.pdf", document: path },
      ]);
    });
    expect(screen.queryByText("could not open file")).not.toBeInTheDocument();
  });

  it("should open a markdown link from an external tab as the tab it already is", async () => {
    const resolved: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "resolve_external_link") {
        resolved.push(args);
        return { kind: "external", path: "/Users/me/other.md" };
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    const path = "/Users/me/docs/note.md";
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    client.setQueryData(noteQueries.conflict("external", path).queryKey, null);
    client.setQueryData(noteQueries.fileKey("external", path), {
      content: "# Ext\n\n[other](../other.md)",
      pinned: false,
      tags: [],
      updatedAt: new Date(1),
    });
    onTestFinished(() => {
      client.clear();
    });
    render(
      <QueryClientProvider client={client}>
        <NoteSession active tab={{ id: "t7", kind: "external", path }} />
        <Toaster />
      </QueryClientProvider>
    );
    const liveEditor = await editor("t7");
    act(() => {
      liveEditor.commands.setTextSelection(
        liveEditor.state.doc.content.size - 2
      );
      liveEditor.commands.keyboardShortcut("Mod-Shift-o");
    });
    await waitFor(() => {
      expect(
        getTabState().tabs.map((entry) => [entry.kind, entry.path])
      ).toContainEqual(["external", "/Users/me/other.md"]);
    });
    expect(screen.queryByText("could not open note")).not.toBeInTheDocument();
    expect(resolved).toStrictEqual([
      { destination: "../other.md", document: "/Users/me/docs/note.md" },
    ]);
  });

  it("should refuse a pasted image in an external tab", async () => {
    const commands: string[] = [];
    mockIPC((command) => {
      commands.push(command);
      return null;
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    const path = "/Users/me/docs/note.md";
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    client.setQueryData(noteQueries.conflict("external", path).queryKey, null);
    client.setQueryData(noteQueries.fileKey("external", path), {
      content: "# Ext\n\ntext",
      pinned: false,
      tags: [],
      updatedAt: new Date(1),
    });
    onTestFinished(() => {
      client.clear();
    });
    render(
      <QueryClientProvider client={client}>
        <NoteSession active tab={{ id: "t8", kind: "external", path }} />
        <Toaster />
      </QueryClientProvider>
    );
    const liveEditor = await editor("t8");
    const clipboardData = new DataTransfer();
    clipboardData.items.add(
      new File([new Uint8Array([137, 80, 78, 71])], "shot.png", {
        type: "image/png",
      })
    );
    act(() => {
      liveEditor.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, clipboardData })
      );
    });
    expect(
      await screen.findByText("could not paste image")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Attachments live in the notes folder")
    ).toBeInTheDocument();
    expect(commands).toStrictEqual([]);
    expect(liveEditor.state.doc.textContent).toBe("Exttext");
  });

  it("should export the rich view as a pdf and refuse from markdown source", async () => {
    const commands: [string, unknown][] = [];
    let printed: string | undefined;
    mockIPC((command, args) => {
      commands.push([command, args]);
      if (command === "plugin:dialog|save") {
        return "/exports/a.pdf";
      }
      printed = document.querySelector(".print-sheet")?.textContent ?? "";
      return null;
    });
    mountSession("---\ntags: [study]\n---\n# Errands\n\none");
    await editor();

    await expect(sessionHandles().exportPdf()).resolves.toBe("/exports/a.pdf");

    expect(commands.map(([command]) => command)).toStrictEqual([
      "plugin:dialog|save",
      "export_pdf",
    ]);
    expect(commands[0]?.[1]).toMatchObject({
      options: { defaultPath: "a.pdf" },
    });
    expect(commands[1]?.[1]).toStrictEqual({
      path: "/exports/a.pdf",
      title: "Errands",
    });
    expect(printed).toBe("Errandsone");
    expect(document.querySelector(".print-sheet")).toBeNull();

    commands.length = 0;
    act(() => {
      sessionHandles().toggleSource();
    });
    await editor();

    await expect(sessionHandles().exportPdf()).rejects.toThrow(
      "Leave Markdown source first"
    );
    expect(commands).toStrictEqual([]);
  });

  it("should render an image relative to the note and drop one the note cannot reach", async () => {
    mockConvertFileSrc("macos");
    mockIPC((command) => {
      throw new Error(`unexpected command: ${command}`);
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    client.setQueryData(noteQueries.list().queryKey, []);
    client.setQueryData(
      noteQueries.conflict("note", "projects/a.md").queryKey,
      null
    );
    client.setQueryData(noteQueries.fileKey("note", "projects/a.md"), {
      content:
        "# A\n\n![shot](./my%20shot.png)\n\n![up](../../up.png)\n\n![abs](/etc/x.png)\n\n![anchor](#x)\n\n![web](https://example.com/a.png)",
      pinned: false,
      tags: [],
      updatedAt: new Date(1),
    });
    onTestFinished(() => {
      client.clear();
    });
    render(
      <QueryClientProvider client={client}>
        <NoteSession
          active
          tab={{ id: "t5", kind: "note", path: "projects/a.md" }}
        />
      </QueryClientProvider>
    );
    await editor("t5");
    const sources = [
      ...(document
        .querySelector(`[id="${tabPanelId("t5")}"]`)
        ?.querySelectorAll("img") ?? []),
    ].map((image) => image.getAttribute("src"));
    expect(sources).toStrictEqual([
      "asset://localhost/%2Fnotes%2Fprojects%2Fmy%20shot.png",
      "",
      "",
      "",
      "https://example.com/a.png",
    ]);
  });

  it("should send an external file's image to the scheme with the document and the source", async () => {
    mockConvertFileSrc("macos");
    mockIPC((command) => {
      throw new Error(`unexpected command: ${command}`);
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    const path = "/Users/me/docs/note.md";
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    client.setQueryData(noteQueries.conflict("external", path).queryKey, null);
    client.setQueryData(noteQueries.fileKey("external", path), {
      content: "# Ext\n\n![shot](../my%20shot.png)",
      pinned: false,
      tags: [],
      updatedAt: new Date(1),
    });
    onTestFinished(() => {
      client.clear();
    });
    render(
      <QueryClientProvider client={client}>
        <NoteSession active tab={{ id: "t6", kind: "external", path }} />
      </QueryClientProvider>
    );
    const liveEditor = await editor("t6");
    const image = document
      .querySelector(`[id="${tabPanelId("t6")}"]`)
      ?.querySelector("img");
    expect(image?.getAttribute("src")).toBe(
      "external-image://localhost/?doc=%2FUsers%2Fme%2Fdocs%2Fnote.md&src=..%2Fmy+shot.png"
    );
    const sources: string[] = [];
    liveEditor.state.doc.descendants((node) => {
      if (node.type.name === "image") {
        sources.push(String(node.attrs.src));
      }
      return true;
    });
    expect(sources).toStrictEqual(["../my%20shot.png"]);
  });

  it("should report a failed pending link lookup without treating the destination as missing", async () => {
    const listed = Promise.withResolvers<[]>();
    mockIPC(async (command) => {
      if (command === "list_notes") {
        return await listed.promise;
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    client.setQueryData(noteQueries.conflict("note", "a.md").queryKey, null);
    client.setQueryData(noteQueries.fileKey("note", "a.md"), {
      content: "# Available\n\n[Target](target.md)",
      pinned: false,
      tags: [],
      updatedAt: new Date(1),
    });
    onTestFinished(async () => {
      act(() => {
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
    act(() => {
      liveEditor.commands.setTextSelection(
        liveEditor.state.doc.content.size - 2
      );
      liveEditor.commands.keyboardShortcut("Mod-Shift-o");
    });
    expect(screen.queryByText("no note at target.md")).not.toBeInTheDocument();
    expect(screen.queryByText("could not open note")).not.toBeInTheDocument();
    act(() => {
      listed.reject({ kind: "failed", message: "index unavailable" });
    });
    expect(await screen.findByText("could not open note")).toBeInTheDocument();
    expect(screen.getByText("index unavailable")).toBeInTheDocument();
    expect(screen.queryByText("no note at target.md")).not.toBeInTheDocument();
    await expect(editor()).resolves.toBe(liveEditor);
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
      mockIPC(async (command) => {
        if (command === "list_notes") {
          return await listed.promise;
        }
        throw new Error(`unexpected command: ${command}`);
      });
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
        },
      });
      client.setQueryData(notesDirQuery.queryKey, "/notes");
      client.setQueryData(noteQueries.conflict("note", "a.md").queryKey, null);
      client.setQueryData(noteQueries.fileKey("note", "a.md"), {
        content: "# Available\n\n[Target](target.md)",
        pinned: false,
        tags: [],
        updatedAt: new Date(1),
      });
      onTestFinished(async () => {
        act(() => {
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
      act(() => {
        liveEditor.commands.setTextSelection(
          liveEditor.state.doc.content.size - 2
        );
        liveEditor.commands.keyboardShortcut("Mod-Shift-o");
      });
      if (change === "switching tabs") {
        act(() => {
          openNote("chosen.md");
        });
      } else if (change === "switching away and back") {
        act(() => {
          openNote("chosen.md");
        });
        session.rerender(
          <QueryClientProvider client={client}>
            <NoteSession active={false} tab={tab} />
          </QueryClientProvider>
        );
        act(() => {
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
      act(() => {
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
      expect(getTabState().tabs.map((entry) => entry.path)).toStrictEqual(
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
      mockIPC(async (command) => {
        if (command === "list_notes") {
          return await listed.promise;
        }
        throw new Error(`unexpected command: ${command}`);
      });
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
        },
      });
      client.setQueryData(notesDirQuery.queryKey, "/notes");
      client.setQueryData(noteQueries.conflict("note", "a.md").queryKey, null);
      client.setQueryData(noteQueries.fileKey("note", "a.md"), {
        content: "# Available\n\n[Target](target.md)",
        pinned: false,
        tags: [],
        updatedAt: new Date(1),
      });
      onTestFinished(async () => {
        act(() => {
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
      act(() => {
        liveEditor.commands.setTextSelection(
          liveEditor.state.doc.content.size - 2
        );
        liveEditor.commands.keyboardShortcut("Mod-Shift-o");
      });
      act(() => {
        if (change === "closing a background tab") {
          closeTab(background);
        } else if (change === "reordering tabs") {
          moveTab(background, 1);
        } else {
          openNote("another.md", true);
          activateTab(origin.id);
        }
      });
      act(() => {
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
      await waitFor(() => {
        expect(
          getTabState().tabs.find(
            (entry) => entry.id === getTabState().activeId
          )?.path
        ).toBe(completion === "resolve" ? "target.md" : "a.md");
      });
      await waitFor(() => {
        expect(screen.queryByText("lookup unavailable") !== null).toBe(
          completion === "reject"
        );
      });
    }
  );

  it("should follow only the most recently activated link while its lookup is pending", async () => {
    const listed = Promise.withResolvers<unknown[]>();
    mockIPC(async (command) => {
      if (command === "list_notes") {
        return await listed.promise;
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    client.setQueryData(noteQueries.conflict("note", "a.md").queryKey, null);
    client.setQueryData(noteQueries.fileKey("note", "a.md"), {
      content: "# Available\n\n[First](first.md) [Second](second.md)",
      pinned: false,
      tags: [],
      updatedAt: new Date(1),
    });
    onTestFinished(async () => {
      act(() => {
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
    act(() => {
      liveEditor.commands.setTextSelection(13);
      liveEditor.commands.keyboardShortcut("Mod-Shift-o");
      liveEditor.commands.setTextSelection(
        liveEditor.state.doc.content.size - 2
      );
      liveEditor.commands.keyboardShortcut("Mod-Shift-o");
    });
    act(() => {
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
    await waitFor(() => {
      expect(getTabState().tabs.map((entry) => entry.path)).toStrictEqual([
        "second.md",
      ]);
    });
  });

  it.each([false, true])(
    "should undo a rename across saving and editor mode changes from source mode %s",
    async (sourceMode) => {
      const writes: unknown[] = [];
      const held = Promise.withResolvers<{
        kind: "committed";
        receipt: {
          path: string;
          revision: string;
          updatedAt: number;
          warnings: never[];
        };
      }>();
      mockIPC(async (command, args) => {
        if (command !== "save_note") {
          return null;
        }
        writes.push(args);
        return writes.length === 1
          ? await held.promise
          : {
              kind: "committed",
              receipt: {
                path: "a.md",
                revision: "r3",
                updatedAt: 3,
                warnings: [],
              },
            };
      });
      mountSession("# Errands\n\nbody");
      await editor();
      if (sourceMode) {
        act(() => {
          sessionHandles().toggleSource();
        });
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
          kind: "committed",
          receipt: {
            path: "weekend-errands-2.md",
            revision: "r2",
            updatedAt: 2,
            warnings: [],
          },
        });
        await renaming;
      });
      await expect(editor()).resolves.toBe(surface);
      expect(surface.state.selection.from).toBe(selection);
      expect(surface.state.doc.textContent).toContain("plus typing");
      act(() => {
        surface.commands.undo();
      });
      expect(surface.state.doc.textContent).not.toContain("plus typing");
      expect(surface.state.doc.textContent).toContain("Weekend errands");
      act(() => {
        sessionHandles().toggleSource();
      });
      const other = await editor();
      act(() => {
        other.commands.undo();
      });
      expect(other.state.doc.textContent).toContain("Errands");
      expect(other.state.doc.textContent).not.toContain("Weekend");
      await act(async () => {
        await expect(flushPendingWrites()).resolves.toBeTruthy();
      });
      expect(writes.at(-1)).toStrictEqual({
        content: "# Errands\n\nbody",
        expected: "r2",
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
          return {
            kind: "committed",
            receipt: {
              path: "errands.md",
              revision: "r2",
              updatedAt: 2,
              warnings: [],
            },
          };
        }
        return null;
      });
      mountSession("# Errands\n\nbody");
      await editor();
      if (sourceMode) {
        act(() => {
          sessionHandles().toggleSource();
        });
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
        name: { kind: "content" },
        path: "a.md",
      });
    }
  );

  it("should recompute the filename when formatting changes the heading", async () => {
    const writes: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "save_note") {
        writes.push(args);
        return {
          kind: "committed",
          receipt: {
            path: "errands.md",
            revision: "r2",
            updatedAt: 2,
            warnings: [],
          },
        };
      }
      return null;
    });
    mountSession("# Errands\n\nbody");
    const surface = await editor();
    act(() => {
      surface.chain().setTextSelection({ from: 1, to: 8 }).toggleBold().run();
    });
    await act(async () => {
      await flushPendingWrites();
    });
    expect(writes.at(-1)).toMatchObject({ name: { kind: "content" } });
  });

  it.each([false, true])(
    "should rename first-line edits and keep lower-body edits unnamed in source mode %s",
    async (sourceMode) => {
      const writes: unknown[] = [];
      mockIPC((command, args) => {
        if (command === "save_note") {
          writes.push(args);
          return {
            kind: "committed",
            receipt: {
              path: "a.md",
              revision: `r${writes.length}`,
              updatedAt: writes.length + 1,
              warnings: [],
            },
          };
        }
        return null;
      });
      mountSession("buy milk\n\nbody");
      await editor();
      if (sourceMode) {
        act(() => {
          sessionHandles().toggleSource();
        });
      }
      const surface = await editor();
      act(() => {
        typeAtEnd(surface, " more");
      });
      await act(async () => {
        await flushPendingWrites();
      });
      expect(writes).toMatchObject([{ name: null }]);
      act(() => {
        surface.commands.insertContentAt(5, "oat ");
      });
      await act(async () => {
        await flushPendingWrites();
      });
      expect(writes.at(-1)).toMatchObject({ name: { kind: "content" } });
    }
  );

  it("should label and rename an external tab from its readable first line", async () => {
    const path = "/outside/imported.md";
    const outside = { id: "outside-title", kind: "external", path } as const;
    const writes: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "write_external") {
        writes.push(args);
        return {
          kind: "committed",
          receipt: {
            path: "/outside/buy-oat-milk.md",
            revision: "r1",
            updatedAt: 2,
            warnings: [],
          },
        };
      }
      if (command.startsWith("plugin:")) {
        return 0;
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    onTestFinished(() => {
      client.clear();
    });
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    client.setQueryData(noteQueries.fileKey("external", path), {
      content: "buy **milk**\n\nbody",
      revision: "r0",
      updatedAt: new Date(1),
    });
    client.setQueryData(noteQueries.conflict("external", path).queryKey, null);
    render(
      <QueryClientProvider client={client}>
        <TabStrip activeId={outside.id} onNew={NOOP} tabs={[outside]} />
        <NoteSession active tab={outside} />
      </QueryClientProvider>
    );
    await screen.findByRole("tab", { name: "buy milk" });
    const surface = await editor(outside.id);
    act(() => {
      surface.commands.insertContentAt(5, "oat ");
    });
    await screen.findByRole("tab", { name: "buy oat milk" });
    await act(async () => {
      await flushPendingWrites();
    });
    expect(writes).toMatchObject([{ name: { kind: "content" }, path }]);
  });

  it("should save the complete document from either editor mode", async () => {
    const writes: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "save_note") {
        writes.push(args);
        return {
          kind: "committed",
          receipt: {
            path: tab.path,
            revision: "r2",
            updatedAt: 2,
            warnings: [],
          },
        };
      }
      return null;
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
      await expect(flushPendingWrites()).resolves.toBeTruthy();
    });
    expect(writes).toStrictEqual([
      {
        content: "---\ntags: [edited]\n---\nbody plus typing",
        expected: "r0",
        name: { kind: "content" },
        path: "a.md",
      },
    ]);
    act(() => {
      rich.commands.insertContent(" again");
    });
    await act(async () => {
      await expect(flushPendingWrites()).resolves.toBeTruthy();
    });
    expect(writes.at(-1)).toStrictEqual({
      content: "---\ntags: [edited]\n---\nbody plus typing again",
      expected: "r2",
      name: { kind: "content" },
      path: "a.md",
    });
  });

  it("should keep newer source edits while an earlier save is in flight", async () => {
    const first = Promise.withResolvers<{
      kind: "committed";
      receipt: {
        path: string;
        revision: string;
        updatedAt: number;
        warnings: [];
      };
    }>();
    const writes: unknown[] = [];
    mockIPC(async (command, args) => {
      if (command === "save_note") {
        writes.push(args);
        return writes.length === 1
          ? await first.promise
          : {
              kind: "committed",
              receipt: {
                path: tab.path,
                revision: "r3",
                updatedAt: 3,
                warnings: [],
              },
            };
      }
      return null;
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
      first.resolve({
        kind: "committed",
        receipt: { path: tab.path, revision: "r2", updatedAt: 2, warnings: [] },
      });
      await expect(flushing).resolves.toBeTruthy();
    });
    expect(writes).toStrictEqual([
      {
        content: "---\ntags: [first]\n---\nbody",
        expected: "r0",
        name: { kind: "content" },
        path: "a.md",
      },
      {
        content: "---\ntags: [second]\n---\nbody later",
        expected: "r2",
        name: { kind: "content" },
        path: "a.md",
      },
    ]);
  });

  it("should show why the first read failed and offer to try again", async () => {
    mountSession();
    await settle();

    expect(panel()?.getAttribute("role")).toBe("tabpanel");
    expect(panel()?.textContent).toContain("could not read this note");
    expect(panel()?.textContent).toContain("Permission denied");
    expect(panel()?.querySelector("button")?.textContent).toBe("try again");
  });

  it("should read again when asked", async () => {
    mountSession();
    await settle();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "try again" }));
    await settle();

    await waitFor(() => {
      expect(reads).toBe(2);
    });
    expect(panel()?.textContent).toContain("could not read this note");
  });

  it("should retain source spelling and undo through repeated rich and source switches", async () => {
    const writes: string[] = [];
    mockIPC((command, args) => {
      if (command === "save_note") {
        if (!savesContent(args)) {
          throw new Error("save content missing");
        }
        writes.push(args.content);
        return {
          kind: "committed",
          receipt: { path: "a.md", revision: "r2", updatedAt: 2, warnings: [] },
        };
      }
      return null;
    });
    mountSession("*hello*");
    await editor();
    act(() => {
      sessionHandles().toggleSource();
    });
    const source = await editor();
    act(() => {
      source.commands.selectAll();
      source.commands.insertContent("_hello_");
    });
    act(() => {
      sessionHandles().toggleSource();
    });
    await editor();
    act(() => {
      sessionHandles().toggleSource();
    });
    const remounted = await editor();
    expect(remounted.state.doc.textContent).toBe("_hello_");
    act(() => {
      remounted.commands.undo();
    });
    expect(remounted.state.doc.textContent).toBe("*hello*");
    act(() => {
      remounted.commands.redo();
    });
    await act(async () => {
      await flushPendingWrites();
    });
    expect(writes.at(-1)).toBe("_hello_");
  });

  it("should combine a change elsewhere in the note with unsaved typing", async () => {
    const client = mountSession("# Errands\n\nbody");
    const liveEditor = await editor();
    act(() => {
      typeAtEnd(liveEditor, "Typed ");
    });
    act(() => {
      client.setQueryData(noteQueries.fileKey("note", tab.path), {
        content: "# Chores\n\nbody",
        pinned: false,
        revision: "r1",
        tags: [],
        updatedAt: new Date(2),
      });
    });
    await waitFor(() => {
      expect(liveEditor.getText()).toContain("Chores");
    });
    expect(liveEditor.getText()).toContain("bodyTyped");
    expect(
      screen.queryByText("this note changed on disk")
    ).not.toBeInTheDocument();
    client.clear();
  });

  it("should announce a change that overlaps unsaved typing", async () => {
    const client = mountSession("# Errands\n\nbody");
    const liveEditor = await editor();
    act(() => {
      typeAtEnd(liveEditor, "Typed ");
    });
    act(() => {
      client.setQueryData(noteQueries.fileKey("note", tab.path), {
        content: "# Errands\n\nbody, on disk",
        pinned: false,
        revision: "r1",
        tags: [],
        updatedAt: new Date(2),
      });
    });
    await waitFor(() =>
      expect(screen.getByText("this note changed on disk")).toBeInTheDocument()
    );
    expect(liveEditor.getText()).toContain("bodyTyped");
    expect(liveEditor.getText()).not.toContain("on disk");
    client.clear();
  });

  it("should show why the note could not be saved until the next write lands", async () => {
    let denied = true;
    const refused = vi.fn<() => Promise<never>>().mockRejectedValue({
      kind: "failed",
      message: "Permission denied",
    });
    mockIPC(async (command) => {
      if (command !== "save_note") {
        return null;
      }
      if (denied) {
        return await refused();
      }
      return {
        kind: "committed",
        receipt: { path: "a.md", revision: "r2", updatedAt: 2, warnings: [] },
      };
    });
    mountSession("# Errands\n\nbody");
    const liveEditor = await editor();
    act(() => {
      typeAtEnd(liveEditor, "Typed ");
    });
    await act(async () => {
      await flushPendingWrites();
    });
    expect(
      screen.getByText("this note could not be saved")
    ).toBeInTheDocument();
    expect(screen.getByText("Permission denied")).toBeInTheDocument();
    denied = false;
    act(() => {
      typeAtEnd(liveEditor, "more ");
    });
    await act(async () => {
      await flushPendingWrites();
    });
    expect(
      screen.queryByText("this note could not be saved")
    ).not.toBeInTheDocument();
  });

  async function mountConflict(
    content: string,
    onDisk: string,
    ipc: Parameters<typeof mockIPC>[0] = () => null
  ) {
    mockIPC((command, args) => {
      if (
        command === "stash_conflict" ||
        command === "clear_conflict" ||
        command === "read_conflict"
      ) {
        return ipc(command, args) ?? null;
      }
      return ipc(command, args);
    });
    const client = mountSession(content);
    const liveEditor = await editor();
    act(() => {
      typeAtEnd(liveEditor, "Typed ");
    });
    act(() => {
      client.setQueryData(noteQueries.fileKey("note", tab.path), {
        content: onDisk,
        pinned: false,
        revision: "r1",
        tags: [],
        updatedAt: new Date(2),
      });
    });
    await waitFor(() =>
      expect(screen.getByText("this note changed on disk")).toBeInTheDocument()
    );
    return { client, liveEditor };
  }

  it("should open the review from the banner, hide the note, and come back on escape", async () => {
    const user = userEvent.setup();
    const { client } = await mountConflict(
      "# Errands\n\nbody",
      "# Errands\n\nbody, on disk"
    );
    expect(review()).toHaveClass("invisible");
    await user.click(screen.getByRole("button", { name: "review" }));
    expect(review()).not.toHaveClass("invisible");
    expect(
      panel()?.querySelector(".ProseMirror")?.closest(".invisible")
    ).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "1 place changed here and on disk" })
    ).toBeInTheDocument();
    expect(screen.getByText("1 of 1 still need a result")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "resolve" })).toBeDisabled();
    expect(
      screen.getByRole("textbox", { name: "result for place 1" })
    ).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(review()).toHaveClass("invisible");
    expect(
      panel()?.querySelector(".ProseMirror")?.closest(".invisible")
    ).toBeNull();
    expect(screen.getByRole("button", { name: "review" })).toHaveFocus();
    client.clear();
  });

  it("should keep a typed result across back and reopening", async () => {
    const user = userEvent.setup();
    const { client } = await mountConflict(
      "# Errands\n\nbody",
      "# Errands\n\nbody, on disk"
    );
    await user.click(screen.getByRole("button", { name: "review" }));
    await user.type(
      screen.getByRole("textbox", { name: "result for place 1" }),
      "body, both"
    );
    await user.click(screen.getByRole("button", { name: "back" }));
    await user.click(screen.getByRole("button", { name: "review" }));
    expect(
      screen.getByRole("textbox", { name: "result for place 1" })
    ).toHaveValue("body, both");
    expect(screen.getByText("Every place has a result")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "resolve" })).toBeEnabled();
    client.clear();
  });

  it("should fill the result from either side and show a deleted side as nothing", async () => {
    const user = userEvent.setup();
    const { client } = await mountConflict("# Errands\n\nbody", "# Errands\n");
    await user.click(screen.getByRole("button", { name: "review" }));
    expect(screen.getByText("nothing")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "use this, mine" }));
    const result = screen.getByRole("textbox", { name: "result for place 1" });
    expect(result).toHaveValue("bodyTyped ");
    expect(result).toHaveFocus();
    await user.click(
      screen.getByRole("button", { name: "use this, the version on disk" })
    );
    expect(result).toHaveValue("");
    expect(screen.getByText("Every place has a result")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "resolve" })).toBeEnabled();
    client.clear();
  });

  it("should close the review when a later change combines, and open the next one on the banner", async () => {
    const user = userEvent.setup();
    const { client } = await mountConflict(
      "# Errands\n\nbody",
      "# Errands\n\nbody, on disk"
    );
    await user.click(screen.getByRole("button", { name: "review" }));
    expect(review()).not.toHaveClass("invisible");
    act(() => {
      client.setQueryData(noteQueries.fileKey("note", tab.path), {
        content: "# Chores\n\nbody",
        pinned: false,
        revision: "r2",
        tags: [],
        updatedAt: new Date(3),
      });
    });
    await waitFor(() => expect(review()).not.toBeInTheDocument());
    act(() => {
      client.setQueryData(noteQueries.fileKey("note", tab.path), {
        content: "# Chores\n\nbody, on disk again",
        pinned: false,
        revision: "r3",
        tags: [],
        updatedAt: new Date(4),
      });
    });
    await waitFor(() =>
      expect(screen.getByText("this note changed on disk")).toBeInTheDocument()
    );
    expect(review()).toHaveClass("invisible");
    client.clear();
  });

  it("should show a heading place at heading size and fold long unchanged runs", async () => {
    const user = userEvent.setup();
    const { client } = await mountConflict(
      "# Errands\n\none\n\ntwo\n\nthree\n\nfour\n\nbody",
      "# Errands\n\none\n\ntwo\n\nthree\n\nfour\n\nbody, on disk"
    );
    await user.click(screen.getByRole("button", { name: "review" }));
    await user.click(
      screen.getByRole("button", { name: "10 unchanged lines" })
    );
    expect(screen.getByText(UNFOLDED_CONTEXT)).toBeInTheDocument();
    client.clear();
    cleanup();

    const heading = await mountConflict("# Errands", "# Chores");
    await user.click(screen.getByRole("button", { name: "review" }));
    expect(screen.getByText("# Chores")).toHaveAttribute("data-heading", "1");
    expect(screen.getByText("# ErrandsTyped")).toHaveAttribute(
      "data-heading",
      "1"
    );
    expect(
      screen.getByRole("textbox", { name: "result for place 1" })
    ).toHaveAttribute("data-heading", "1");
    heading.client.clear();
  });

  it("should resolve a place, save the composed note, and clear the stored review", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    const writes: unknown[] = [];
    const { client, liveEditor } = await mountConflict(
      "# Errands\n\nbody",
      "# Errands\n\nbody, on disk",
      (command, args) => {
        calls.push(command);
        if (command === "save_note") {
          writes.push(args);
          return {
            kind: "committed",
            receipt: {
              path: "a.md",
              revision: "r2",
              updatedAt: 3,
              warnings: [],
            },
          };
        }
        return null;
      }
    );
    await user.click(screen.getByRole("button", { name: "review" }));
    await user.type(
      screen.getByRole("textbox", { name: "result for place 1" }),
      "body, both"
    );
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(review()).not.toBeInTheDocument();
    expect(
      screen.queryByText("this note changed on disk")
    ).not.toBeInTheDocument();
    expect(liveEditor.getText()).toContain("body, both");
    expect(liveEditor.getText()).not.toContain("on disk");
    await act(async () => {
      await flushPendingWrites();
    });
    expect(writes).toStrictEqual([
      expect.objectContaining({ content: "# Errands\n\nbody, both" }),
    ]);
    expect(calls.filter((call) => call === "clear_conflict")).toHaveLength(1);
    expect(liveEditor.isFocused).toBeTruthy();
    client.clear();
  });

  it("should reopen a note with its stored review and the banner", async () => {
    mockIPC(() => null);
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    client.setQueryData(noteQueries.fileKey("note", tab.path), {
      content: "# Errands\n\nbody, on disk",
      pinned: false,
      revision: "r1",
      tags: [],
      updatedAt: new Date(2),
    });
    client.setQueryData(noteQueries.list().queryKey, []);
    const stored: ConflictStash = {
      base: {
        content: "# Errands\n\nbody",
        revision: "r0",
        updatedAt: new Date(1),
      },
      ours: "# Errands\n\nbody, mine",
    };
    client.setQueryData(
      noteQueries.conflict("note", tab.path).queryKey,
      stored
    );
    client.setQueryData(notesDirQuery.queryKey, "/notes");
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
    const liveEditor = await editor();
    expect(liveEditor.getText()).toContain("body, mine");
    await waitFor(() =>
      expect(screen.getByText("this note changed on disk")).toBeInTheDocument()
    );
    client.clear();
  });

  it("should show the initial merge of stored edits and the current file in the rich editor", async () => {
    const writes: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "save_note") {
        writes.push(args);
        return {
          kind: "committed",
          receipt: { path: "a.md", revision: "r2", updatedAt: 3, warnings: [] },
        };
      }
      return null;
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    client.setQueryData(noteQueries.fileKey("note", tab.path), {
      content: "# Updated title\n\nbody",
      pinned: false,
      revision: "r1",
      tags: [],
      updatedAt: new Date(2),
    });
    client.setQueryData(noteQueries.list().queryKey, []);
    const stored: ConflictStash = {
      base: {
        content: "# Errands\n\nbody",
        revision: "r0",
        updatedAt: new Date(1),
      },
      ours: "# Errands\n\nmy body",
    };
    client.setQueryData(
      noteQueries.conflict("note", tab.path).queryKey,
      stored
    );
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    render(
      <QueryClientProvider client={client}>
        <NoteSession active tab={tab} />
      </QueryClientProvider>
    );
    const liveEditor = await editor();
    await waitFor(() => {
      expect(liveEditor.getText()).toContain("Updated title");
      expect(liveEditor.getText()).toContain("my body");
    });
    await act(async () => {
      expect(await flushPendingWrites()).toBeTruthy();
    });
    expect(writes).toMatchObject([{ content: "# Updated title\n\nmy body" }]);
    client.clear();
  });

  it("should not open a note until its stored review is known", async () => {
    mockIPC(async (command) => {
      if (command === "read_conflict") {
        return await Promise.withResolvers().promise;
      }
      return null;
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    client.setQueryData(noteQueries.fileKey("note", tab.path), {
      content: "# Errands\n\nbody",
      pinned: false,
      revision: "r0",
      tags: [],
      updatedAt: new Date(1),
    });
    client.setQueryData(noteQueries.list().queryKey, []);
    client.setQueryData(notesDirQuery.queryKey, "/notes");
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
    await Promise.resolve();
    expect(panel()).toBeNull();
    client.clear();
  });

  it("should keep the stored review in the query cache as it is written and cleared", async () => {
    const user = userEvent.setup();
    const { client } = await mountConflict(
      "# Errands\n\nbody",
      "# Errands\n\nbody, on disk",
      (command) =>
        command === "save_note"
          ? {
              kind: "committed",
              receipt: {
                path: "a.md",
                revision: "r2",
                updatedAt: 3,
                warnings: [],
              },
            }
          : null
    );
    await waitFor(() => {
      expect(
        client.getQueryData(noteQueries.conflict("note", tab.path).queryKey)
      ).toMatchObject({ ours: "# Errands\n\nbodyTyped " });
    });
    await user.click(screen.getByRole("button", { name: "review" }));
    await user.type(
      screen.getByRole("textbox", { name: "result for place 1" }),
      "body, both"
    );
    await user.click(screen.getByRole("button", { name: "resolve" }));
    await act(async () => {
      await flushPendingWrites();
    });
    expect(
      client.getQueryData(noteQueries.conflict("note", tab.path).queryKey)
    ).toBeNull();
    client.clear();
  });

  it("should keep the editor across a rename while the renamed review is unknown", async () => {
    mockIPC(async (command) =>
      command === "read_conflict" ? await Promise.withResolvers().promise : null
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    for (const path of [tab.path, "errands.md"]) {
      client.setQueryData(noteQueries.fileKey("note", path), {
        content: "# Errands\n\nbody",
        pinned: false,
        revision: "r0",
        tags: [],
        updatedAt: new Date(1),
      });
    }
    client.setQueryData(noteQueries.list().queryKey, []);
    client.setQueryData(noteQueries.conflict("note", tab.path).queryKey, null);
    client.setQueryData(notesDirQuery.queryKey, "/notes");
    const session = (path: string) =>
      createElement(
        StrictMode,
        null,
        createElement(
          QueryClientProvider,
          { client },
          createElement(NoteSession, { active: true, tab: { ...tab, path } })
        )
      );
    const view = render(session(tab.path));
    const liveEditor = await editor();
    view.rerender(session("errands.md"));
    await Promise.resolve();
    expect(panel()).not.toBeNull();
    await expect(editor()).resolves.toBe(liveEditor);
    client.clear();
  });
});
