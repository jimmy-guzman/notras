import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor as TiptapEditor } from "@tiptap/core";
import { object, parse, string } from "valibot";
import { beforeEach, describe, expect, it, onTestFinished } from "vitest";

import { Layout } from "@/layout";
import { readRecentNotes } from "@/lib/recent-notes";
import { closeTab, getTabState } from "@/lib/tabs/store";
import { noteFind } from "@/lib/ui/find";
import { closeNoteBrowser } from "@/lib/ui/note-browser";
import { closeNotePanel } from "@/lib/ui/note-panel";
import { hideGraph } from "@/lib/ui/view";

const editors = () => document.querySelectorAll(".ProseMirror").length;

/** The tab showing, which its view describes. */
const showingTab = () => screen.getByRole("tab", { selected: true });

const NEW_NOTE = /new note/u;

describe("workspace", () => {
  beforeEach(() => {
    localStorage.removeItem("recent-notes:/notes");
    closeNoteBrowser();
    closeNotePanel();
  });

  it("should open note search from the welcome screen", async () => {
    localStorage.removeItem("tabs");
    mockWindows("main");
    mockIPC((command) => {
      if (command === "get_notes_dir") {
        return "/notes";
      }

      if (command === "index_status") {
        return { state: "ready" };
      }

      if (command === "list_notes" || command === "list_tags") {
        return [];
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

    await user.click(await screen.findByRole("button", { name: /^search\b/u }));

    expect(
      await screen.findByRole("combobox", { name: "find a note" })
    ).toBeInTheDocument();
  });

  it("should show only the app's controls with no tab, and only the outline in a draft's note panel", async () => {
    localStorage.removeItem("tabs");
    mockWindows("main");
    mockIPC((command) => {
      if (command === "get_notes_dir") {
        return "/notes";
      }

      if (command === "index_status") {
        return { state: "ready" };
      }

      if (command === "list_notes" || command === "list_tags") {
        return [];
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

    await screen.findByRole("button", { name: "browse notes" });
    expect(
      screen.queryByRole("button", { name: "note panel" })
    ).not.toBeInTheDocument();

    const [newNote] = await screen.findAllByRole("button", { name: NEW_NOTE });

    if (newNote === undefined) {
      throw new Error("new note action did not render");
    }

    await user.click(newNote);
    await screen.findByRole("tab", { name: "untitled" });
    await user.click(screen.getByRole("button", { name: "note panel" }));

    const toggles = await screen.findByRole("group", { name: "note panel" });

    expect(
      within(toggles)
        .getAllByRole("button")
        .map((toggle) => toggle.getAttribute("aria-label"))
    ).toStrictEqual(["outline"]);
  });

  it("should open a draft before library queries finish, creating nothing, and keep it when a late restore lands", async () => {
    localStorage.removeItem("tabs");
    mockWindows("main");
    const recent = Promise.withResolvers<unknown[]>();
    const tags = Promise.withResolvers<[]>();
    mockIPC(async (command, args) => {
      if (command === "get_notes_dir") {
        return "/notes";
      }

      if (command === "index_status") {
        return { state: "ready" };
      }

      if (command === "list_notes") {
        if (args === undefined || !("filters" in args)) {
          throw new Error("list_notes requires filters");
        }

        return await recent.promise;
      }

      if (command === "list_tags") {
        return await tags.promise;
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

    onTestFinished(async () => {
      act(() => {
        recent.resolve([]);
        tags.resolve([]);
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
    const buttons = await screen.findAllByRole("button", { name: NEW_NOTE });
    const [button] = buttons;

    if (button === undefined) {
      throw new Error("new note action did not render");
    }

    await user.click(button);
    expect(
      await screen.findByRole("tab", { name: "untitled" })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector(".ProseMirror")).toHaveFocus();
    });
    act(() => {
      recent.resolve([
        {
          createdAt: 1,
          folder: "",
          path: "older.md",
          pinned: false,
          snippet: null,
          tags: [],
          title: "Older",
          updatedAt: 1,
        },
      ]);
    });
    await waitFor(() => {
      expect(getTabState().tabs.map((tab) => tab.kind)).toStrictEqual([
        "draft",
      ]);
    });
    expect(screen.getByRole("tab", { name: "untitled" })).toBeInTheDocument();
  });

  it("should mount a restored tab's editor when it is first selected, then keep it", async () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "first",
        carets: { first: 2, second: 4 },
        tabs: [
          { id: "first", kind: "note", path: "first.md" },
          { id: "second", kind: "note", path: "second.md" },
        ],
      })
    );
    mockWindows("main");
    mockIPC((command) => {
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
        return {
          content: "# Restored\n\nRestored document",
          revision: "r",
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

    await screen.findByText("Restored document");
    expect(editors()).toBe(1);
    expect(readRecentNotes("/notes")).toStrictEqual([]);

    // Unmounted, the tab still wears its filename stem.
    await user.click(screen.getByRole("tab", { name: "second" }));
    await waitFor(() => {
      expect(editors()).toBe(2);
      expect(readRecentNotes("/notes")).toStrictEqual(["second.md"]);
    });

    await user.click(screen.getByRole("tab", { selected: false }));
    expect(editors()).toBe(2);
    expect(readRecentNotes("/notes")).toStrictEqual(["first.md", "second.md"]);
  });

  it("should put focus back on the graph's centre when its showing tab is picked from the list", async () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "second",
        carets: {},
        tabs: [
          { id: "first", kind: "note", path: "first.md" },
          { id: "second", kind: "note", path: "second.md" },
        ],
      })
    );
    mockWindows("main");
    mockIPC((command) => {
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
        return { content: "# Restored\n\nbody", revision: "r", updatedAt: 1 };
      }

      if (command === "read_graph") {
        return {
          mentionsError: null,
          picture: {
            graph: { dangling: [], hubs: [], incoming: [], outgoing: [] },
            kind: "note",
            note: {
              createdAt: 0,
              folder: "",
              path: "second.md",
              pinned: false,
              snippet: null,
              tags: [],
              title: "second",
              updatedAt: 0,
            },
          },
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
      hideGraph("second");

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

    await screen.findByText("body");
    await user.keyboard("{Control>}{Alt>}g{/Alt}{/Control}");
    await screen.findByRole("button", { name: "second" });
    await user.click(screen.getByRole("button", { name: "show tabs" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "Restored" })
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "second" })).toHaveFocus();
    });
  });

  it("should mark the view showing on its tab and go from the graph to the source on ⌘E", async () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "only",
        carets: {},
        tabs: [{ id: "only", kind: "note", path: "only.md" }],
      })
    );
    mockWindows("main");
    mockIPC((command) => {
      if (command === "classify_open_paths") {
        return [{ kind: "note", path: "only.md" }];
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
        return { content: "# Only\n\nbody", revision: "r", updatedAt: 1 };
      }

      if (command === "read_graph") {
        return {
          mentionsError: null,
          picture: {
            graph: { dangling: [], hubs: [], incoming: [], outgoing: [] },
            kind: "note",
            note: {
              createdAt: 0,
              folder: "",
              path: "only.md",
              pinned: false,
              snippet: null,
              tags: [],
              title: "only",
              updatedAt: 0,
            },
          },
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
      hideGraph("only");

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

    await screen.findByText("body");
    expect(showingTab()).toHaveAccessibleDescription("note");

    await user.keyboard("{Control>}{Alt>}g{/Alt}{/Control}");
    await screen.findByRole("button", { name: "only" });
    expect(showingTab()).toHaveAccessibleDescription("graph view");

    await user.keyboard("{Control>}e{/Control}");

    await waitFor(() => {
      expect(document.querySelector("[data-source-editor]")).not.toBeNull();
    });
    expect(screen.queryByRole("button", { name: "only" })).toBeNull();
    expect(showingTab()).toHaveAccessibleDescription("markdown source");

    await user.keyboard("{Control>}e{/Control}");

    await waitFor(() => {
      expect(document.querySelector("[data-source-editor]")).toBeNull();
    });
    expect(showingTab()).toHaveAccessibleDescription("note");
  });

  it("should switch the note panel between mentions and the outline by chord", async () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "only",
        carets: {},
        tabs: [{ id: "only", kind: "note", path: "only.md" }],
      })
    );
    mockWindows("main");
    mockIPC((command) => {
      if (command === "classify_open_paths") {
        return [{ kind: "note", path: "only.md" }];
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
          content: "# Only\n\n## First\n\nbody\n\n## Second",
          revision: "r",
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
      closeNotePanel();

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

    await screen.findByText("body");
    await user.keyboard("{Control>}{Shift>}l{/Shift}{/Control}");
    expect(
      await screen.findByRole("complementary", { name: "note panel: mentions" })
    ).toBeInTheDocument();
    expect(await screen.findByText("no notes link here")).toBeInTheDocument();

    await user.keyboard("{Control>}{Shift>}h{/Shift}{/Control}");
    expect(
      await screen.findByRole("complementary", { name: "note panel: outline" })
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "outline" }))
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toStrictEqual(["First", "Second"]);
  });

  it("should focus the view a chord shows, and leave it when the chord is pressed again", async () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "only",
        carets: {},
        tabs: [{ id: "only", kind: "note", path: "only.md" }],
      })
    );
    mockWindows("main");
    mockIPC((command) => {
      if (command === "classify_open_paths") {
        return [{ kind: "note", path: "only.md" }];
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
        return { content: "# Only\n\nbody", revision: "r", updatedAt: 1 };
      }

      if (command === "read_graph") {
        return {
          mentionsError: null,
          picture: {
            graph: { dangling: [], hubs: [], incoming: [], outgoing: [] },
            kind: "note",
            note: {
              createdAt: 0,
              folder: "",
              path: "only.md",
              pinned: false,
              snippet: null,
              tags: [],
              title: "only",
              updatedAt: 0,
            },
          },
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
      hideGraph("only");

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

    await screen.findByText("body");
    expect(showingTab()).toHaveAccessibleDescription("note");

    await user.keyboard("{Control>}{Alt>}g{/Alt}{/Control}");
    await screen.findByRole("button", { name: "only" });
    expect(showingTab()).toHaveAccessibleDescription("graph view");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "only" })).toHaveFocus();
    });

    await user.keyboard("{Control>}{Alt>}g{/Alt}{/Control}");
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "only" })).toBeNull();
    });
    expect(showingTab()).toHaveAccessibleDescription("note");
    await waitFor(() => {
      expect(document.querySelector(".ProseMirror")).toHaveFocus();
    });

    await user.keyboard("{Control>}e{/Control}");
    await waitFor(() => {
      expect(document.querySelector("[data-source-editor]")).not.toBeNull();
    });
    expect(showingTab()).toHaveAccessibleDescription("markdown source");

    await user.keyboard("{Control>}e{/Control}");
    await waitFor(() => {
      expect(document.querySelector("[data-source-editor]")).toBeNull();
    });
    expect(showingTab()).toHaveAccessibleDescription("note");
  });

  it("should return from the graph to the source it left", async () => {
    localStorage.setItem(
      "tabs",
      JSON.stringify({
        activeId: "only",
        carets: {},
        tabs: [{ id: "only", kind: "note", path: "only.md" }],
      })
    );
    mockWindows("main");
    mockIPC((command) => {
      if (command === "classify_open_paths") {
        return [{ kind: "note", path: "only.md" }];
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
        return { content: "# Only\n\nbody", revision: "r", updatedAt: 1 };
      }

      if (command === "read_graph") {
        return {
          mentionsError: null,
          picture: {
            graph: { dangling: [], hubs: [], incoming: [], outgoing: [] },
            kind: "note",
            note: {
              createdAt: 0,
              folder: "",
              path: "only.md",
              pinned: false,
              snippet: null,
              tags: [],
              title: "only",
              updatedAt: 0,
            },
          },
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
      hideGraph("only");

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

    await screen.findByText("body");
    await user.keyboard("{Control>}e{/Control}");
    await waitFor(() => {
      expect(document.querySelector("[data-source-editor]")).not.toBeNull();
    });

    await user.keyboard("{Control>}{Alt>}g{/Alt}{/Control}");
    await screen.findByRole("button", { name: "only" });
    expect(showingTab()).toHaveAccessibleDescription("graph view");

    await user.keyboard("{Control>}{Alt>}g{/Alt}{/Control}");
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "only" })).toBeNull();
    });
    expect(document.querySelector("[data-source-editor]")).not.toBeNull();
    expect(showingTab()).toHaveAccessibleDescription("markdown source");
  });

  it.each(["picking another tab from the list", "toggling markdown source"])(
    "should keep focus in the open find bar after %s",
    async (action) => {
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

          return path === "first.md"
            ? { content: "# First\n\nfirst body", revision: "r", updatedAt: 1 }
            : {
                content: "# Second\n\nsecond body",
                revision: "r",
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
        noteFind.dismiss();

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

      await screen.findByText("first body");
      await user.click(screen.getByRole("tab", { name: "second" }));
      await screen.findByText("second body");
      await user.keyboard("{Control>}f{/Control}");
      await screen.findByRole("textbox", { name: "find text" });

      if (action === "toggling markdown source") {
        await user.keyboard("{Control>}e{/Control}");
      } else {
        await user.click(screen.getByRole("button", { name: "show tabs" }));
        await user.click(
          await screen.findByRole("menuitemradio", { name: "First" })
        );
      }

      await waitFor(() => {
        expect(
          screen.getByRole("textbox", { name: "find text" })
        ).toHaveFocus();
      });
    }
  );

  it.each([
    { action: "closing", remainingTabs: [] },
    { action: "replacing", remainingTabs: ["Second"] },
  ])(
    "should dispose the rich editor without rebuilding it when $action the active tab",
    async ({ action, remainingTabs }) => {
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
              createdAt: 1,
              folder: "",
              path: "second.md",
              pinned: false,
              snippet: null,
              tags: [],
              title: "Second",
              updatedAt: 1,
            },
          ];
        }

        if (command === "read_conflict") {
          return null;
        }

        if (command === "read_note") {
          if (args === undefined || !("path" in args)) {
            throw new Error("read_note requires a path");
          }

          if (args.path === "first.md") {
            return {
              content:
                "# First\n\n```\nfirst\n```\n\n```\nsecond\n```\n\nEnd of first note.",
              revision: "r1",
              updatedAt: 1,
            };
          }

          if (args.path === "second.md") {
            return {
              content: "# Second\n\nReplacement document.",
              revision: "r2",
              updatedAt: 1,
            };
          }

          throw new Error(`unexpected path: ${String(args.path)}`);
        }

        if (
          ["list_tags", "take_pending_open", "find_mentions"].includes(command)
        ) {
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
      await screen.findByText("End of first note.");

      const surface = screen
        .getByRole("tabpanel")
        .querySelector(".ProseMirror");

      if (
        surface === null ||
        !("editor" in surface) ||
        !(surface.editor instanceof TiptapEditor)
      ) {
        throw new Error("the rich editor did not mount");
      }

      const { editor } = surface;
      const mutations: MutationRecord[] = [];

      const observer = new MutationObserver((records) => {
        mutations.push(...records);
      });

      observer.observe(surface, { childList: true, subtree: true });
      onTestFinished(() => {
        observer.disconnect();
      });

      if (action === "closing") {
        await user.click(screen.getByRole("button", { name: "close First" }));
      } else {
        await user.keyboard("{Control>}p{/Control}");
        await user.click(await screen.findByRole("option", { name: "Second" }));
        await screen.findByText("Replacement document.");
      }

      await waitFor(() => {
        expect(editor.isDestroyed).toBeTruthy();
      });
      mutations.push(...observer.takeRecords());
      observer.disconnect();
      expect(
        screen.queryAllByRole("tab").map((tab) => tab.textContent)
      ).toStrictEqual(remainingTabs);
      expect(
        screen
          .queryAllByRole("tab", { selected: true })
          .map((tab) => tab.textContent)
      ).toStrictEqual(remainingTabs);
      expect(surface).not.toBeInTheDocument();
      expect(
        mutations.flatMap((record) => [...record.addedNodes])
      ).toHaveLength(0);
    }
  );
});
