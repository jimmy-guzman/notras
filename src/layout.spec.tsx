import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import {
  clearMocks,
  mockConvertFileSrc,
  mockIPC,
  mockWindows,
} from "@tauri-apps/api/mocks";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { Editor as TiptapEditor } from "@tiptap/core";
import { object, parse, string } from "valibot";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { Toaster } from "@/components/ui/toast";
import { SNIPPET_END, SNIPPET_START } from "@/core/fts-markers";
import { Layout } from "@/layout";
import { registerPendingFlush } from "@/lib/pending-flush";
import { closeTab, getTabState } from "@/lib/tabs/store";
import { noteFind } from "@/lib/ui/find";
import { closeNoteBrowser } from "@/lib/ui/note-browser";

const fileAt = (path: string) =>
  path === "left.md" || path === "/notes/left.md"
    ? { content: "# Left\n\nLeft behind", revision: "r2", updatedAt: 1 }
    : {
        content: "# Chosen\n\nAvailable document",
        revision: "r1",
        updatedAt: 1,
      };

describe("layout", () => {
  beforeEach(() => {
    closeNoteBrowser();
  });

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

  it.each([
    {
      trigger: "the window regains focus",
      wake: async () => {
        act(() => {
          fireEvent.focus(window);
        });
      },
    },
    {
      trigger: "the watcher reports it",
      wake: async () => {
        await emit("notes-changed", { paths: ["data.csv"] });
      },
    },
  ])("should re-read a csv tab when $trigger", async ({ wake }) => {
    const path = "/notes/data.csv";
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "saved",
        carets: {},
        tabs: [{ id: "saved", kind: "csv", path }],
      })
    );
    mockWindows("main");
    // happy-dom lays nothing out, and the row window draws nothing into a
    // viewport of no height, so the geometry is stubbed at the DOM boundary.
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);

    let onDisk = [["Lima", "first"]];
    let revision = 0;

    mockIPC(
      (command) => {
        if (command === "classify_open_paths") {
          return [{ kind: "csv", path }];
        }

        if (command === "get_notes_dir") {
          return "/notes";
        }

        if (command === "index_status") {
          return { state: "ready" };
        }

        if (command === "list_images") {
          return { paths: [], unreadable: [] };
        }

        if (command === "list_notes" || command === "list_tags") {
          return [];
        }

        if (command === "read_csv_if_moved") {
          revision += 1;

          return {
            header: ["city", "count"],
            page: 256,
            pages: [0],
            probe: [],
            revision: `r${revision}`,
            rows: onDisk.length,
          };
        }

        if (command === "read_csv_rows") {
          return onDisk;
        }

        if (command === "take_pending_open") {
          return [];
        }

        if (command.startsWith("plugin:")) {
          return 0;
        }

        throw new Error(`unexpected command: ${command}`);
      },
      { shouldMockEvents: true }
    );

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
      vi.restoreAllMocks();
      localStorage.removeItem("tabs");
    });
    render(
      <QueryClientProvider client={client}>
        <Layout />
      </QueryClientProvider>
    );

    expect(
      await screen.findByRole("cell", { name: "first" })
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "data.csv" })).toBeInTheDocument();
    onDisk = [["Lima", "changed elsewhere"]];
    await wake();

    expect(
      await screen.findByRole("cell", { name: "changed elsewhere" })
    ).toBeInTheDocument();
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
    await user.keyboard("{Control>}p{/Control}");
    await user.type(await screen.findByRole("combobox"), "atl");
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

  it.each([
    ["nothing", async () => {}],
    [
      "the note browser search",
      async (user: UserEvent) => {
        await user.keyboard("{Control>}\\{/Control}");

        const search = await screen.findByRole("textbox", {
          name: "search all notes",
        });

        await user.click(search);
        expect(search).toHaveFocus();
      },
    ],
    [
      "the find bar",
      async (user: UserEvent) => {
        await user.keyboard("{Control>}f{/Control}");
        expect(
          await screen.findByRole("textbox", { name: "find text" })
        ).toHaveFocus();
      },
    ],
    [
      "the find bar on a match",
      async (user: UserEvent) => {
        await user.keyboard("{Control>}f{/Control}");
        expect(
          await screen.findByRole("textbox", { name: "find text" })
        ).toHaveFocus();
        await user.keyboard("Nothing");
        expect(await screen.findByText("1 / 1")).toBeInTheDocument();
      },
    ],
  ])(
    "should open a continued jot in a new tab with the caret where the writing stopped while %s holds focus",
    async (_, takeFocus) => {
      localStorage.setItem(
        "tabs",
        JSON.stringify({
          activeId: "first",
          carets: {},
          tabs: [{ id: "first", kind: "note", path: "first.md" }],
        })
      );
      mockWindows("main");
      mockIPC(
        (command, args) => {
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

          if (command === "read_conflict") {
            return null;
          }

          if (command === "read_note") {
            const { path } = parse(object({ path: string() }), args);

            return {
              content: path === "jot.md" ? "a jot in progress" : "Nothing here",
              revision: "r1",
              updatedAt: 1,
            };
          }

          if (
            command === "take_pending_open" ||
            command === "find_mentions" ||
            command === "pending_open_files"
          ) {
            return [];
          }

          if (command.startsWith("plugin:")) {
            return 0;
          }

          throw new Error(`unexpected command: ${command}`);
        },
        { shouldMockEvents: true }
      );

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

      expect(
        await screen.findByText("Nothing here", { selector: "p" })
      ).toBeInTheDocument();
      await takeFocus(userEvent.setup());
      await act(async () => {
        await emit("jot-continued", { caret: 5, path: "jot.md" });
      });

      expect(
        await screen.findByText("a jot in progress", { selector: "p" })
      ).toBeInTheDocument();
      expect(getTabState().tabs.map(({ path }) => path)).toStrictEqual([
        "first.md",
        "jot.md",
      ]);
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

      const before = document.createRange();
      before.setStart(paragraph, 0);
      before.setEnd(anchor, caret.anchorOffset);
      expect(paragraph.textContent).toBe("a jot in progress");
      expect(before.toString()).toBe("a jot");

      const [left] = document.querySelectorAll(".ProseMirror");

      if (
        left === undefined ||
        !("editor" in left) ||
        !(left.editor instanceof TiptapEditor)
      ) {
        throw new Error("the note left behind has no editor");
      }

      expect(left.editor.state.selection.empty).toBeTruthy();
    }
  );

  it("should keep the actions palette on screen while it fades out", async () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "first",
        carets: {},
        tabs: [{ id: "first", kind: "note", path: "first.md" }],
      })
    );
    mockWindows("main");
    mockIPC((command) => {
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

      if (command === "read_conflict") {
        return null;
      }

      if (command === "read_note") {
        return {
          content: "# First\n\nNothing here",
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
    await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
    expect(await screen.findByText("pin note")).toBeInTheDocument();

    const fade = screen
      .getByRole("dialog")
      .animate([{ opacity: 1 }, { opacity: 0 }], 60_000);

    await user.keyboard("{Escape}");

    expect(screen.getByText("pin note")).toBeInTheDocument();
    act(() => {
      fade.finish();
    });
    await waitFor(() => {
      expect(screen.queryByText("pin note")).not.toBeInTheDocument();
    });
  });

  it("should keep a picked toggle's label while the palette fades out", async () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "first",
        carets: {},
        tabs: [{ id: "first", kind: "note", path: "first.md" }],
      })
    );
    mockWindows("main");
    mockIPC((command) => {
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

      if (command === "read_conflict") {
        return null;
      }

      if (command === "read_note") {
        return {
          content: "# First\n\nNothing here",
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
      for (const tab of getTabState().tabs) {
        closeTab(tab.id);
      }

      client.clear();
      clearMocks();
      localStorage.removeItem("tabs");
      localStorage.removeItem("recent-actions");
    });
    render(
      <QueryClientProvider client={client}>
        <Layout />
      </QueryClientProvider>
    );
    const user = userEvent.setup();

    expect(await screen.findByText("Nothing here")).toBeInTheDocument();
    await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
    expect(
      await screen.findByText("turn on markdown source")
    ).toBeInTheDocument();

    const fade = screen
      .getByRole("dialog")
      .animate([{ opacity: 1 }, { opacity: 0 }], 60_000);

    await user.click(
      screen.getByRole("option", { name: /^turn on markdown source/u })
    );

    expect(screen.getByText("turn on markdown source")).toBeInTheDocument();
    expect(
      screen.queryByText("turn off markdown source")
    ).not.toBeInTheDocument();
    act(() => {
      fade.finish();
    });
    await waitFor(() => {
      expect(document.querySelector("[data-source-editor]")).not.toBeNull();
      expect(
        screen.getByRole("tab", { selected: true })
      ).toHaveAccessibleDescription("markdown source");
    });
  });

  it("should keep the closed tab's rows while the palette fades out", async () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "first",
        carets: {},
        tabs: [{ id: "first", kind: "note", path: "first.md" }],
      })
    );
    mockWindows("main");
    mockIPC((command) => {
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

      if (command === "read_conflict") {
        return null;
      }

      if (command === "read_note") {
        return {
          content: "# First\n\nNothing here",
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
      for (const tab of getTabState().tabs) {
        closeTab(tab.id);
      }

      client.clear();
      clearMocks();
      localStorage.removeItem("tabs");
      localStorage.removeItem("recent-actions");
    });
    render(
      <QueryClientProvider client={client}>
        <Layout />
      </QueryClientProvider>
    );
    const user = userEvent.setup();

    expect(await screen.findByText("Nothing here")).toBeInTheDocument();
    await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
    expect(await screen.findByText("close tab")).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");

    expect(within(dialog).queryByText("recent")).not.toBeInTheDocument();

    const fade = dialog.animate([{ opacity: 1 }, { opacity: 0 }], 60_000);

    await user.click(screen.getByRole("option", { name: "close tab ctrl+w" }));

    expect(screen.getByText("pin note")).toBeInTheDocument();
    expect(within(dialog).queryByText("recent")).not.toBeInTheDocument();
    act(() => {
      fade.finish();
    });
    await waitFor(() => {
      expect(screen.queryByText("pin note")).not.toBeInTheDocument();
    });
    expect(getTabState().tabs).toStrictEqual([]);
  });

  it("should keep a picked recent note in the list while the palette fades out", async () => {
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

      if (command === "list_notes") {
        return [
          {
            createdAt: 0,
            folder: "",
            path: "first.md",
            pinned: false,
            snippet: null,
            tags: [],
            title: "First",
            updatedAt: 3,
          },
          {
            createdAt: 0,
            folder: "",
            path: "second.md",
            pinned: false,
            snippet: null,
            tags: [],
            title: "Second",
            updatedAt: 2,
          },
          {
            createdAt: 0,
            folder: "",
            path: "third.md",
            pinned: false,
            snippet: null,
            tags: [],
            title: "Third",
            updatedAt: 1,
          },
        ];
      }

      if (command === "list_tags") {
        return [];
      }

      if (command === "read_conflict") {
        return null;
      }

      if (command === "read_note") {
        const { path } = parse(object({ path: string() }), args);

        return {
          content:
            path === "second.md"
              ? "# Second\n\nPicked"
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
      for (const tab of getTabState().tabs) {
        closeTab(tab.id);
      }

      client.clear();
      clearMocks();
      localStorage.clear();
    });
    render(
      <QueryClientProvider client={client}>
        <Layout />
      </QueryClientProvider>
    );
    const user = userEvent.setup();

    expect(await screen.findByText("Nothing here")).toBeInTheDocument();
    await user.keyboard("{Control>}p{/Control}");

    const dialog = await screen.findByRole("dialog");

    expect(
      await within(dialog).findByRole("option", { name: /Second/u })
    ).toBeInTheDocument();

    const fade = dialog.animate([{ opacity: 1 }, { opacity: 0 }], 60_000);

    await user.click(within(dialog).getByRole("option", { name: /Second/u }));

    expect(await screen.findByText("Picked")).toBeInTheDocument();
    expect(within(dialog).getByText("Second")).toBeInTheDocument();
    expect(within(dialog).getByText("Third")).toBeInTheDocument();
    act(() => {
      fade.finish();
    });
    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument();
    });
  });

  it("should call off an update restart and say the update waits when a buffer cannot be written", async () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "first",
        carets: {},
        tabs: [{ id: "first", kind: "note", path: "first.md" }],
      })
    );
    mockWindows("main");
    const calls: string[] = [];
    mockIPC(
      (command) => {
        calls.push(command);

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

        if (command === "read_conflict") {
          return null;
        }

        if (command === "read_note") {
          return {
            content: "# First\n\nNothing here",
            revision: "r1",
            updatedAt: 1,
          };
        }

        if (
          command === "take_pending_open" ||
          command === "find_mentions" ||
          command === "pending_open_files"
        ) {
          return [];
        }

        if (command === "cancel_quit" || command.startsWith("plugin:")) {
          return null;
        }

        throw new Error(`unexpected command: ${command}`);
      },
      { shouldMockEvents: true }
    );

    const unregister = registerPendingFlush(
      async () => await Promise.resolve(false)
    );

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });

    onTestFinished(() => {
      unregister();

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
        <Toaster />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Nothing here")).toBeInTheDocument();
    await emit("app-quit", { ending: "restart" });

    expect(
      await screen.findByText("could not restart into the update")
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(calls).toContain("cancel_quit");
    });
    expect(calls).not.toContain("quit_app");
  });

  it("should list the library's images again for a changed file but not for a saved note", async () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "first",
        carets: {},
        tabs: [{ id: "first", kind: "note", path: "first.md" }],
      })
    );
    mockWindows("main");
    let walks = 0;
    let noteLists = 0;
    mockIPC(
      (command) => {
        if (command === "list_images") {
          walks += 1;

          return { paths: [], unreadable: [] };
        }

        if (command === "list_notes") {
          noteLists += 1;

          return [];
        }

        if (command === "classify_open_paths") {
          return [{ kind: "note", path: "first.md" }];
        }

        if (command === "get_notes_dir") {
          return "/notes";
        }

        if (command === "index_status") {
          return { state: "ready" };
        }

        if (command === "list_tags") {
          return [];
        }

        if (command === "read_conflict") {
          return null;
        }

        if (command === "read_note") {
          return {
            content: "# First\n\nNothing here\n\n![[a.png]]",
            revision: "r1",
            updatedAt: 1,
          };
        }

        if (
          command === "take_pending_open" ||
          command === "find_mentions" ||
          command === "pending_open_files"
        ) {
          return [];
        }

        if (command.startsWith("plugin:")) {
          return null;
        }

        throw new Error(`unexpected command: ${command}`);
      },
      { shouldMockEvents: true }
    );

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

    expect(
      await screen.findByText('No image is named "a.png"')
    ).toBeInTheDocument();
    expect(walks).toBe(1);

    const listedBefore = noteLists;

    await emit("notes-changed", { paths: ["first.md"] });
    await waitFor(() => {
      expect(noteLists).toBeGreaterThan(listedBefore);
    });

    expect(walks).toBe(1);

    await emit("notes-changed", { paths: ["first.md", "attachments/a.png"] });
    await waitFor(() => {
      expect(walks).toBe(2);
    });
  });

  it.each([
    { change: "its path", paths: ["attachments/a.png"] },
    { change: "a folder named like a note", paths: ["archive.md/"] },
    { change: "no paths", paths: [] },
  ])(
    "should show an image when a change naming $change lands during a walk",
    async ({ paths }) => {
      localStorage.setItem(
        "tabs",
        JSON.stringify({
          activeId: "first",
          carets: {},
          tabs: [{ id: "first", kind: "note", path: "first.md" }],
        })
      );
      mockWindows("main");
      mockConvertFileSrc("macos");

      const heldWalk = Promise.withResolvers<{
        paths: string[];
        unreadable: string[];
      }>();

      let walks = 0;

      mockIPC(
        async (command) => {
          if (command === "list_images") {
            walks += 1;

            if (walks === 1) {
              return { paths: [], unreadable: [] };
            }

            return walks === 2
              ? await heldWalk.promise
              : { paths: ["attachments/a.png"], unreadable: [] };
          }

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

          if (command === "read_conflict") {
            return null;
          }

          if (command === "read_note") {
            return {
              content: "# First\n\nNothing here\n\n![[a.png]]",
              revision: "r1",
              updatedAt: 1,
            };
          }

          if (
            command === "take_pending_open" ||
            command === "find_mentions" ||
            command === "pending_open_files"
          ) {
            return [];
          }

          if (command.startsWith("plugin:")) {
            return null;
          }

          throw new Error(`unexpected command: ${command}`);
        },
        { shouldMockEvents: true }
      );

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

      expect(
        await screen.findByText('No image is named "a.png"')
      ).toBeInTheDocument();

      await emit("notes-changed", { paths: ["attachments/b.png"] });
      await waitFor(() => {
        expect(walks).toBe(2);
      });

      await emit("notes-changed", { paths });
      heldWalk.resolve({ paths: [], unreadable: [] });

      expect(
        await screen.findByRole("img", { name: "a.png" })
      ).toBeInTheDocument();
    }
  );

  it.each([
    { case: "one embed", embeds: "![[a.png]]", held: 1, images: ["a.png"] },
    {
      case: "two embeds",
      embeds: "![[a.png]]\n\n![[b.png]]",
      held: 1,
      images: ["a.png", "b.png"],
    },
    {
      case: "two changes",
      embeds: "![[a.png]]",
      held: 2,
      images: ["a.png"],
    },
  ])(
    "should show an image that lands during the first walk with $case",
    async ({ embeds, held, images }) => {
      localStorage.setItem(
        "tabs",
        JSON.stringify({
          activeId: "first",
          carets: {},
          tabs: [{ id: "first", kind: "note", path: "first.md" }],
        })
      );
      mockWindows("main");
      mockConvertFileSrc("macos");

      const heldWalk = Promise.withResolvers<{
        paths: string[];
        unreadable: string[];
      }>();

      let walks = 0;

      mockIPC(
        async (command) => {
          if (command === "list_images") {
            walks += 1;

            return walks <= held
              ? await heldWalk.promise
              : {
                  paths: ["attachments/a.png", "attachments/b.png"],
                  unreadable: [],
                };
          }

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

          if (command === "read_conflict") {
            return null;
          }

          if (command === "read_note") {
            return {
              content: `# First\n\nNothing here\n\n${embeds}`,
              revision: "r1",
              updatedAt: 1,
            };
          }

          if (
            command === "take_pending_open" ||
            command === "find_mentions" ||
            command === "pending_open_files"
          ) {
            return [];
          }

          if (command.startsWith("plugin:")) {
            return null;
          }

          throw new Error(`unexpected command: ${command}`);
        },
        { shouldMockEvents: true }
      );

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

      await waitFor(() => {
        expect(walks).toBe(1);
      });
      await emit("notes-changed", { paths: ["attachments/a.png"] });
      await waitFor(() => {
        expect(walks).toBeGreaterThanOrEqual(held);
      });

      if (held === 2) {
        await emit("notes-changed", { paths: ["attachments/a.png"] });
      }

      heldWalk.resolve({ paths: [], unreadable: [] });

      await Promise.all(
        images.map(async (name) => {
          expect(await screen.findByRole("img", { name })).toBeInTheDocument();
        })
      );
    }
  );

  it("should say why in an embed's place when the walk replacing the first one fails", async () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "first",
        carets: {},
        tabs: [{ id: "first", kind: "note", path: "first.md" }],
      })
    );
    mockWindows("main");

    const heldWalk = Promise.withResolvers<{
      paths: string[];
      unreadable: string[];
    }>();

    let walks = 0;

    mockIPC(
      async (command) => {
        if (command === "list_images") {
          walks += 1;

          if (walks === 1) {
            return await heldWalk.promise;
          }

          throw Object.assign(new Error("Permission denied"), {
            kind: "failed",
          });
        }

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

        if (command === "read_conflict") {
          return null;
        }

        if (command === "read_note") {
          return {
            content: "# First\n\nNothing here\n\n![[a.png]]",
            revision: "r1",
            updatedAt: 1,
          };
        }

        if (
          command === "take_pending_open" ||
          command === "find_mentions" ||
          command === "pending_open_files"
        ) {
          return [];
        }

        if (command.startsWith("plugin:")) {
          return null;
        }

        throw new Error(`unexpected command: ${command}`);
      },
      { shouldMockEvents: true }
    );

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

    await waitFor(() => {
      expect(walks).toBe(1);
    });

    await emit("notes-changed", { paths: ["attachments/a.png"] });
    heldWalk.resolve({ paths: [], unreadable: [] });

    expect(await screen.findByText("Permission denied")).toBeInTheDocument();
  });
});
