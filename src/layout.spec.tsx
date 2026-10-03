import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { object, parse, string } from "valibot";
import { describe, expect, it, onTestFinished } from "vitest";

import { SNIPPET_END, SNIPPET_START } from "@/core/fts-markers";
import { Layout } from "@/layout";
import { closeTab, getTabState } from "@/lib/tabs/store";
import { noteFind } from "@/lib/ui/find";

const fileAt = (path: string) =>
  path === "left.md" || path === "/notes/left.md"
    ? { content: "# Left\n\nLeft behind", revision: "r2", updatedAt: 1 }
    : {
        content: "# Chosen\n\nAvailable document",
        revision: "r1",
        updatedAt: 1,
      };

describe("layout", () => {
  it("should recover the workspace after a failed restore is retried", async () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "saved",
        carets: {},
        tabs: [{ id: "saved", kind: "external", path: "/notes/chosen.md" }],
      })
    );
    mockWindows("main");
    let classifications = 0;
    mockIPC((command) => {
      if (command === "classify_open_paths") {
        classifications += 1;
        if (classifications < 3) {
          throw new Error("classify failed");
        }
        return [{ kind: "note", path: "chosen.md" }];
      }
      if (command === "get_notes_dir") {
        return "/notes";
      }
      if (command === "index_status") {
        return { state: "ready" };
      }
      if (command === "list_notes" || command === "list_tags") {
        return [];
      }
      if (command === "read_conflict") {
        return null;
      }
      if (command === "read_note") {
        return {
          content: "# Chosen\n\nAvailable document",
          pinned: false,
          tags: [],
          title: "Chosen",
          updatedAt: 1,
        };
      }
      if (command === "take_pending_open" || command === "find_mentions") {
        return [];
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
      for (const tab of getTabState().tabs) {
        closeTab(tab.id);
      }
      client.clear();
      clearMocks();
      localStorage.removeItem("tabs");
    });
    render(
      <QueryClientProvider client={client}>
        <Layout />
      </QueryClientProvider>
    );
    const user = userEvent.setup();

    await screen.findByText("could not load the workspace");
    screen.getByText("classify failed");
    await user.click(screen.getByRole("button", { name: "try again" }));
    await screen.findByText("could not load the workspace");
    expect(classifications).toBe(2);
    await user.click(screen.getByRole("button", { name: "try again" }));
    await screen.findByRole("tab", { name: "Chosen" });
    expect(getTabState().tabs.map((tab) => tab.path)).toStrictEqual([
      "chosen.md",
    ]);
    expect(classifications).toBe(3);
  });

  it("should re-read an external tab when the window regains focus", async () => {
    const path = "/Users/me/outside.md";
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "saved",
        carets: {},
        tabs: [{ id: "saved", kind: "external", path }],
      })
    );
    mockWindows("main");
    let reads = 0;
    let onDisk = {
      content: "# Outside\n\nfirst",
      revision: "r1",
      updatedAt: 1,
    };
    mockIPC((command) => {
      if (command === "classify_open_paths") {
        return [{ kind: "external", path }];
      }
      if (command === "get_notes_dir") {
        return "/notes";
      }
      if (command === "index_status") {
        return { state: "ready" };
      }
      if (command === "list_notes" || command === "list_tags") {
        return [];
      }
      if (command === "read_conflict") {
        return null;
      }
      if (command === "read_external") {
        reads += 1;
        return onDisk;
      }
      if (command === "take_pending_open") {
        return [];
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
      for (const tab of getTabState().tabs) {
        closeTab(tab.id);
      }
      client.clear();
      clearMocks();
      localStorage.removeItem("tabs");
    });
    render(
      <QueryClientProvider client={client}>
        <Layout />
      </QueryClientProvider>
    );

    expect(await screen.findByText("first")).toBeInTheDocument();
    // The opening read, then the buffer's own read once its editor attaches.
    await waitFor(() => {
      expect(reads).toBe(2);
    });
    onDisk = {
      content: "# Outside\n\nchanged elsewhere",
      revision: "r2",
      updatedAt: 2,
    };
    act(() => {
      fireEvent.focus(window);
    });

    expect(await screen.findByText("changed elsewhere")).toBeInTheDocument();
  });

  it("should make every open tab follow its file when the notes folder changes", async () => {
    const path = "/new/chosen.md";
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "saved",
        carets: {},
        tabs: [
          { id: "saved", kind: "external", path },
          { id: "left", kind: "note", path: "left.md" },
        ],
      })
    );
    mockWindows("main");
    let notesDir = "/notes";
    const noteReads: string[] = [];
    const externalReads: string[] = [];
    const calls: string[] = [];
    mockIPC((command, args) => {
      calls.push(command);
      if (command === "write_external") {
        return {
          kind: "committed",
          receipt: { path, revision: "r3", updatedAt: 2, warnings: [] },
        };
      }
      if (command === "classify_open_paths") {
        return notesDir === "/new"
          ? [
              { kind: "note", path: "chosen.md" },
              { kind: "external", path: "/notes/left.md" },
            ]
          : [
              { kind: "external", path },
              { kind: "note", path: "left.md" },
            ];
      }
      if (command === "get_notes_dir") {
        return notesDir;
      }
      if (command === "set_notes_dir") {
        notesDir = "/new";
        return null;
      }
      if (command === "plugin:dialog|open") {
        return "/new";
      }
      if (command === "index_status") {
        return { state: "ready" };
      }
      if (command === "list_notes" || command === "list_tags") {
        return [];
      }
      if (command === "read_conflict") {
        return null;
      }
      if (command === "read_external" || command === "read_note") {
        const { path: file } = parse(object({ path: string() }), args);
        (command === "read_note" ? noteReads : externalReads).push(file);
        return fileAt(file);
      }
      if (command === "take_pending_open" || command === "find_mentions") {
        return [];
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
      for (const tab of getTabState().tabs) {
        closeTab(tab.id);
      }
      client.clear();
      clearMocks();
      localStorage.removeItem("tabs");
    });
    render(
      <QueryClientProvider client={client}>
        <Layout />
      </QueryClientProvider>
    );
    const user = userEvent.setup();

    expect(await screen.findByText("Available document")).toBeInTheDocument();
    // Only the showing tab mounts, so nothing has read the note yet.
    expect(noteReads).toHaveLength(0);
    await user.keyboard("typed ");
    await user.keyboard("{Control>},{/Control}");
    await user.click(await screen.findByRole("button", { name: "change..." }));

    await waitFor(() => {
      expect(getTabState().tabs).toStrictEqual([
        { id: "saved", kind: "note", path: "chosen.md" },
        { id: "left", kind: "external", path: "/notes/left.md" },
      ]);
    });
    // The edit landed where the tab was, before the folder moved under it.
    expect(calls.indexOf("write_external")).toBeGreaterThan(-1);
    expect(calls.indexOf("write_external")).toBeLessThan(
      calls.indexOf("set_notes_dir")
    );
    // The showing tab remounted as a note and read from the library.
    await waitFor(() => {
      expect(noteReads).toContain("chosen.md");
    });
    await user.keyboard("{Escape}");
    // The tab left behind opens as an external file at its old path.
    await user.click(await screen.findByRole("tab", { name: /left/iu }));
    await waitFor(() => {
      expect(externalReads).toContain("/notes/left.md");
    });
    expect(await screen.findByText("Left behind")).toBeInTheDocument();
    expect(
      await screen.findByRole("tab", { name: "Chosen" })
    ).toBeInTheDocument();
    expect(await screen.findByText("Available document")).toBeInTheDocument();
  });

  it("should save every open tab when the window loses focus", async () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "first",
        carets: {},
        tabs: [
          { id: "first", kind: "note", path: "first.md" },
          { id: "second", kind: "note", path: "second.md" },
        ],
      })
    );
    mockWindows("main");
    const saved: string[] = [];
    mockIPC((command, args) => {
      if (command === "classify_open_paths") {
        return [
          { kind: "note", path: "first.md" },
          { kind: "note", path: "second.md" },
        ];
      }
      if (command === "get_notes_dir") {
        return "/notes";
      }
      if (command === "index_status") {
        return { state: "ready" };
      }
      if (command === "list_notes" || command === "list_tags") {
        return [];
      }
      if (command === "read_conflict") {
        return null;
      }
      if (command === "read_note") {
        const { path } = parse(object({ path: string() }), args);
        return {
          content: `# ${path}\n\nbody of ${path}`,
          revision: "r1",
          updatedAt: 1,
        };
      }
      if (command === "save_note") {
        const { path } = parse(object({ path: string() }), args);
        saved.push(path);
        return {
          kind: "committed",
          receipt: { path, revision: "r2", updatedAt: 2, warnings: [] },
        };
      }
      if (command === "take_pending_open" || command === "find_mentions") {
        return [];
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
      for (const tab of getTabState().tabs) {
        closeTab(tab.id);
      }
      client.clear();
      clearMocks();
      localStorage.removeItem("tabs");
    });
    render(
      <QueryClientProvider client={client}>
        <Layout />
      </QueryClientProvider>
    );
    const user = userEvent.setup();

    expect(await screen.findByText("body of first.md")).toBeInTheDocument();
    await user.keyboard("typed ");
    await user.click(screen.getByRole("tab", { name: /second/iu }));
    expect(await screen.findByText("body of second.md")).toBeInTheDocument();
    await user.keyboard("typed ");

    // Neither 800ms debounce has run, so only the blur can write them.
    expect(saved).toStrictEqual([]);

    act(() => {
      fireEvent.blur(window);
    });

    await waitFor(
      () => {
        expect(saved.toSorted()).toStrictEqual(["first.md", "second.md"]);
      },
      { timeout: 400 }
    );
  });

  it("should open a palette body hit with the caret on its match and the find bar unfocused", async () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "first",
        carets: {},
        tabs: [{ id: "first", kind: "note", path: "first.md" }],
      })
    );
    mockWindows("main");
    mockIPC((command, args) => {
      if (command === "classify_open_paths") {
        return [{ kind: "note", path: "first.md" }];
      }
      if (command === "get_notes_dir") {
        return "/notes";
      }
      if (command === "index_status") {
        return { state: "ready" };
      }
      if (command === "list_notes" || command === "list_tags") {
        return [];
      }
      if (command === "search_notes") {
        return [
          {
            createdAt: 0,
            folder: "",
            path: "found.md",
            pinned: false,
            snippet: `An ${SNIPPET_START}atlas${SNIPPET_END} entry`,
            tags: [],
            title: "Found",
            updatedAt: 1,
          },
        ];
      }
      if (command === "read_conflict") {
        return null;
      }
      if (command === "read_note") {
        const { path } = parse(object({ path: string() }), args);
        return {
          content:
            path === "found.md"
              ? "# Found\n\nAn atlas entry"
              : "# First\n\nNothing here",
          revision: "r1",
          updatedAt: 1,
        };
      }
      if (command === "take_pending_open" || command === "find_mentions") {
        return [];
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
      act(() => {
        noteFind.close();
      });
      for (const tab of getTabState().tabs) {
        closeTab(tab.id);
      }
      client.clear();
      clearMocks();
      localStorage.removeItem("tabs");
    });
    render(
      <QueryClientProvider client={client}>
        <Layout />
      </QueryClientProvider>
    );
    const user = userEvent.setup();

    expect(await screen.findByText("Nothing here")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "find a note" }));
    await user.type(screen.getByRole("combobox"), "atl");
    await user.click(await screen.findByRole("option", { name: /Found/u }));

    expect(
      await screen.findByRole("textbox", { name: "find text" })
    ).toHaveValue("atlas");
    expect(await screen.findByText("1 / 1")).toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toHaveClass("ProseMirror")
    );
    const caret = window.getSelection();
    const anchor = caret?.anchorNode;
    const paragraph = anchor?.parentElement?.closest("p");
    if (
      caret === null ||
      anchor === null ||
      anchor === undefined ||
      paragraph === null ||
      paragraph === undefined
    ) {
      throw new Error("the caret is not in a paragraph");
    }
    expect(caret.isCollapsed).toBeTruthy();
    expect(paragraph.textContent).toBe("An atlas entry");
    const before = document.createRange();
    before.setStart(paragraph, 0);
    before.setEnd(anchor, caret.anchorOffset);
    expect(before.toString()).toBe("An ");
  });
});
