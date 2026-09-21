import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createStore } from "@tanstack/react-store";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { CommandPalette } from "@/components/command-palette";
import { Toaster } from "@/components/ui/toast";
import { Workspace } from "@/components/workspace/workspace";
import type { NoteMeta } from "@/core/notes";
import { parseSearch } from "@/core/search";
import { noteQueries } from "@/data/queries";
import { readRecentNotes, rememberNote } from "@/lib/recent-notes";
import type { TabSnapshot } from "@/lib/tabs/store";
import {
  closeTab,
  getTabState,
  openNote,
  registerTabHandles,
  registerTabSnapshot,
} from "@/lib/tabs/store";

const FOUND_NOTE = /Found/u;
const CREATE_NOTE = /create/u;

function mount(mode: "actions" | "find", notes: NoteMeta[]) {
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  client.setQueryData(noteQueries.list().queryKey, notes);
  client.setQueryData(noteQueries.tags().queryKey, [{ count: 1, tag: "work" }]);
  const closed: boolean[] = [];
  onTestFinished(() => {
    client.clear();
  });
  const { unmount } = render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(CommandPalette, {
        mode,
        notesDir: "/notes",
        onOpenChange: (next) => {
          closed.push(next);
        },
        onOpenSettings: () => {},
        open: true,
      })
    )
  );
  return {
    client,
    closed,
    get input() {
      return screen.getByRole<HTMLInputElement>("combobox");
    },
    unmount,
    user,
  };
}

describe("command palette keyboard", () => {
  it("should open the async search result with Enter rather than inserting a filter", async () => {
    const note: NoteMeta = {
      createdAt: new Date(0),
      folder: "projects",
      path: "projects/roadmap.md",
      pinned: false,
      snippet: "Roadmap context",
      tags: [],
      title: "Roadmap",
      updatedAt: new Date(0),
    };
    const palette = mount("find", []);
    const read = Promise.withResolvers<NoteMeta[]>();
    const pending = Promise.allSettled([
      palette.client.query({
        ...noteQueries.search(parseSearch("Roadmap")),
        queryFn: async () => await read.promise,
      }),
    ]);
    await palette.user.clear(palette.input);
    await palette.user.type(palette.input, "Roadmap");
    expect(document.body.textContent).not.toContain("searching notes");
    await palette.user.keyboard("{Enter}");
    expect(palette.input.value).toBe("Roadmap");
    await act(async () => {
      read.resolve([note]);
      await pending;
    });
    await waitFor(() => {
      expect(
        screen.getByRole("option", { selected: true }).textContent
      ).toContain("Roadmap");
    });
    await palette.user.keyboard("{Enter}");
    expect(palette.closed).toContain(false);
    expect(
      getTabState().tabs.some((tab) => tab.path === note.path)
    ).toBeTruthy();
  });

  it("should keep filter discovery outside result selection and preserve the query through the picker", async () => {
    const palette = mount("find", [
      {
        createdAt: new Date(0),
        folder: "work/2026",
        path: "work/2026/budget.md",
        pinned: false,
        snippet: null,
        tags: ["work"],
        title: "Budget",
        updatedAt: new Date(0),
      },
    ]);
    await palette.user.clear(palette.input);
    await palette.user.type(palette.input, "budget #work ");
    const addFilter = screen.getByRole("button", { name: "add filter" });
    expect(addFilter).toBeDefined();
    await palette.user.click(addFilter);
    expect(palette.input.value).toBe("");
    await palette.user.clear(palette.input);
    await palette.user.type(palette.input, "folder");
    await act(async () => {
      await Promise.resolve();
    });
    await palette.user.keyboard("{Enter}");
    expect(palette.input.value).toBe("budget #work folder:");
    expect(document.body.textContent).not.toContain("incomplete filter");
    const folder = screen.getByRole("option", { name: "work 1" });
    expect(folder?.textContent).toContain("1");
    await palette.user.click(folder);
    expect(palette.input.value).toBe("budget #work folder:work ");
    expect(palette.input).toHaveFocus();
    await palette.user.click(addFilter);
    await palette.user.keyboard("{Escape}");
    expect(palette.input.value).toBe("budget #work folder:work ");
    expect(palette.closed).toStrictEqual([]);
  });

  it("should select the first filter when opening its empty menu and go back from its footer", async () => {
    const palette = mount("find", []);
    const addFilter = screen.getByRole("button", { name: "add filter" });
    await palette.user.click(addFilter);
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByRole("option", { selected: true }).textContent
    ).toContain("folder");
    const back = screen.getByRole("button", { name: "back to notes" });
    act(() => {
      back.focus();
    });
    await palette.user.keyboard("{Escape}");
    expect(palette.input.value).toBe("");
    expect(palette.closed).toStrictEqual([]);
    expect(document.body.textContent).toContain("add filter");
  });

  it("should keep an arrow-key choice when the same query receives updated results", async () => {
    const palette = mount("find", []);
    const first: NoteMeta = {
      createdAt: new Date(0),
      folder: "work",
      path: "work/first.md",
      pinned: false,
      snippet: null,
      tags: [],
      title: "Project first",
      updatedAt: new Date(0),
    };
    const second: NoteMeta = {
      createdAt: new Date(0),
      folder: "work",
      path: "work/second.md",
      pinned: false,
      snippet: null,
      tags: [],
      title: "Project second",
      updatedAt: new Date(0),
    };
    const options = noteQueries.search(parseSearch("project"));
    palette.client.setQueryData(options.queryKey, [first, second]);
    await palette.user.clear(palette.input);
    await palette.user.type(palette.input, "project");
    await waitFor(() => {
      expect(
        screen.getByRole("option", { selected: true }).textContent
      ).toContain("Project first");
    });
    await palette.user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("option", { selected: true }).textContent
    ).toContain("Project second");
    const read = Promise.withResolvers<NoteMeta[]>();
    const pending = Promise.allSettled([
      palette.client.query({
        ...options,
        queryFn: async () => await read.promise,
        staleTime: 0,
      }),
    ]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByRole("option", { selected: true }).textContent
    ).toContain("Project second");
    await act(async () => {
      read.resolve([second, first]);
      await pending;
    });
    await waitFor(() => {
      expect(
        screen.getByRole("option", { selected: true }).textContent
      ).toContain("Project second");
    });
    await palette.user.keyboard("{Enter}");
    expect(palette.closed).toContain(false);
    expect(
      getTabState().tabs.some((tab) => tab.path === second.path)
    ).toBeTruthy();
  });

  it("should select creation after an empty search completes", async () => {
    const palette = mount("find", []);
    palette.client.setQueryData(
      noteQueries.search(parseSearch("new project")).queryKey,
      []
    );
    await palette.user.clear(palette.input);
    await palette.user.type(palette.input, "new project");
    expect(document.querySelector('[role="option"]')).toBeNull();
    await waitFor(() => {
      expect(
        screen.getByRole("option", { selected: true }).textContent
      ).toContain('create "new project"');
    });
  });

  it("should match visible action wording and select the existing rename title", async () => {
    openNote("projects/atlas.md");
    registerTabSnapshot(
      getTabState().activeId,
      createStore(() => ({
        pinned: true,
        reason: undefined,
        sourceMode: false,
        status: "dirty",
        tags: ["work"],
        title: "Atlas",
        words: 1,
      }))
    );
    const palette = mount("actions", [
      {
        createdAt: new Date(0),
        folder: "projects",
        path: "projects/atlas.md",
        pinned: false,
        snippet: null,
        tags: ["work"],
        title: "outdated indexed title",
        updatedAt: new Date(0),
      },
    ]);
    await palette.user.clear(palette.input);
    await palette.user.type(palette.input, "unpin");
    expect(document.body.textContent).toContain("unpin note");
    await palette.user.clear(palette.input);
    await palette.user.type(palette.input, "turn on focus");
    expect(document.body.textContent).toContain("turn on focus mode");
    await palette.user.clear(palette.input);
    await palette.user.type(palette.input, "rename");
    await act(async () => {
      await Promise.resolve();
    });
    await palette.user.keyboard("{Enter}");
    expect(palette.input.value).toBe("Atlas");
    expect([
      palette.input.selectionStart,
      palette.input.selectionEnd,
    ]).toStrictEqual([0, 5]);
    await palette.user.keyboard("{Escape}");
    expect(palette.closed).toStrictEqual([]);
    expect(palette.input.value).toBe("");
    expect(document.body.textContent).toContain("rename note");
    const label = document.querySelector(
      `[id="${palette.input.getAttribute("aria-labelledby") ?? ""}"]`
    );
    expect(label?.textContent).toBe("run an action");
  });
});

describe("command palette actions", () => {
  it("should export a pdf through the showing tab's session and close on macOS", async () => {
    // happy-dom does not report macOS, and the row exists only there.
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    openNote("projects/atlas.md");
    const exportPdf = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValue("/exports/atlas.pdf");
    registerTabHandles(getTabState().activeId, {
      exportPdf,
      getCaret: () => 0,
      insertText: () => {},
      toggleSource: () => {},
    });
    const palette = mount("actions", []);
    await palette.user.type(palette.input, "export");
    expect(document.body.textContent).toContain("export pdf...");
    await palette.user.keyboard("{Enter}");
    expect(exportPdf).toHaveBeenCalledOnce();
    expect(palette.closed).toStrictEqual([false]);
  });

  it("should offer no pdf export away from macOS", async () => {
    openNote("projects/atlas.md");
    registerTabHandles(getTabState().activeId, {
      exportPdf: async () => null,
      getCaret: () => 0,
      insertText: () => {},
      toggleSource: () => {},
    });
    const palette = mount("actions", []);
    await palette.user.type(palette.input, "export");
    expect(document.body.textContent).not.toContain("export pdf");
    expect(document.body.textContent).toContain("nothing found");
  });
});

describe("recent commands", () => {
  beforeEach(() => {
    localStorage.removeItem("recent-actions");
    for (const tab of getTabState().tabs) {
      closeTab(tab.id);
    }
    onTestFinished(() => {
      localStorage.removeItem("recent-actions");
    });
  });

  it.each([
    null,
    "broken json",
    "{}",
    '["settings", 1]',
    '["settings", "settings"]',
  ])(
    "should keep the usual command order when history is missing or invalid: %s",
    (stored) => {
      if (stored !== null) {
        localStorage.setItem("recent-actions", stored);
      }
      mount("actions", []);

      expect(
        screen.queryByRole("group", { name: "recent" })
      ).not.toBeInTheDocument();
      expect(
        screen.getAllByRole("option").map((row) => row.textContent)
      ).toStrictEqual([
        "new note",
        "turn on focus mode",
        "reopen last closed tab",
        "quick capture",
        "settings",
        "reindex library",
        "check for updates...",
      ]);
    }
  );

  it("should remember a command chosen from search when the palette reopens", async () => {
    const palette = mount("actions", []);
    await palette.user.type(palette.input, "settings");
    await palette.user.keyboard("{Enter}");
    expect(palette.closed).toStrictEqual([false]);
    palette.unmount();
    const reopened = mount("actions", []);

    const recent = screen.getByRole("group", { name: "recent" });
    expect(within(recent).getAllByRole("option")).toHaveLength(1);
    expect(
      within(recent).getByRole("option", { name: "settings" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: "settings" })).toHaveLength(1);
    await waitFor(() => {
      expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
        "settings"
      );
    });
    await reopened.user.keyboard("{Enter}");
    expect(reopened.closed).toStrictEqual([false]);
  });

  it("should lead with the last five distinct choices and keep the rest in their usual order", async () => {
    openNote("atlas.md");
    registerTabSnapshot(
      getTabState().activeId,
      createStore<TabSnapshot>(() => ({
        pinned: false,
        reason: undefined,
        sourceMode: false,
        status: "saved",
        tags: [],
        title: "Atlas",
        words: 1,
      }))
    );
    const initial = mount("actions", []);
    const usual = screen.getAllByRole("option").map((row) => row.textContent);
    initial.unmount();

    for (const name of [
      "settings",
      "settings",
      "settings",
      "rename note...",
      "move to folder...",
      "delete note...",
      "edit tags...",
      "show mentions",
    ]) {
      const palette = mount("actions", []);
      // oxlint-disable-next-line no-await-in-loop -- choices must finish in order to establish recency
      await palette.user.click(screen.getByRole("option", { name }));
      palette.unmount();
    }
    const palette = mount("actions", []);
    const recent = [
      "show mentions",
      "edit tags...",
      "delete note...",
      "move to folder...",
      "rename note...",
    ];
    expect(
      within(screen.getByRole("group", { name: "recent" }))
        .getAllByRole("option")
        .map((row) => row.textContent)
    ).toStrictEqual(recent);
    expect(
      within(screen.getByRole("group", { name: "actions" }))
        .getAllByRole("option")
        .map((row) => row.textContent)
    ).toStrictEqual(usual.filter((name) => !recent.includes(name ?? "")));

    await palette.user.click(screen.getByRole("option", { name: "settings" }));
    palette.unmount();
    mount("actions", []);
    expect(
      within(screen.getByRole("group", { name: "recent" }))
        .getAllByRole("option")
        .map((row) => row.textContent)
    ).toStrictEqual([
      "settings",
      "show mentions",
      "edit tags...",
      "delete note...",
      "move to folder...",
    ]);
    expect(screen.getAllByRole("option")).toHaveLength(usual.length);

    act(() => {
      closeTab(getTabState().activeId);
    });
    expect(
      within(screen.getByRole("group", { name: "recent" }))
        .getAllByRole("option")
        .map((row) => row.textContent)
    ).toStrictEqual(["settings"]);
    expect(
      screen.queryByRole("option", { name: "rename note..." })
    ).not.toBeInTheDocument();
  });

  it("should use the usual matching order while typing and restore recent commands when cleared", async () => {
    openNote("atlas.md");
    for (const name of ["close other tabs", "close tabs to the right"]) {
      const palette = mount("actions", []);
      // oxlint-disable-next-line no-await-in-loop -- choices must finish in order to establish recency
      await palette.user.click(screen.getByRole("option", { name }));
      palette.unmount();
    }
    const palette = mount("actions", []);
    await palette.user.type(palette.input, "close");

    expect(
      screen.queryByRole("group", { name: "recent" })
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("option").map((row) => row.textContent)
    ).toStrictEqual([
      "close tab",
      "close other tabs",
      "close tabs to the right",
      "reopen last closed tab",
    ]);
    await palette.user.clear(palette.input);
    expect(
      within(screen.getByRole("group", { name: "recent" }))
        .getAllByRole("option")
        .map((row) => row.textContent)
    ).toStrictEqual(["close tabs to the right", "close other tabs"]);
    await palette.user.type(palette.input, "   ");
    expect(
      within(screen.getByRole("group", { name: "recent" })).getAllByRole(
        "option"
      )
    ).toHaveLength(2);
  });

  it("should fill recent commands from available history before applying the limit", () => {
    localStorage.setItem(
      "recent-actions",
      JSON.stringify([
        "rename-note",
        "move-note",
        "delete-note",
        "edit-tags",
        "show-mentions",
        "settings",
      ])
    );
    mount("actions", []);

    expect(
      within(screen.getByRole("group", { name: "recent" }))
        .getAllByRole("option")
        .map((row) => row.textContent)
    ).toStrictEqual(["settings"]);
  });

  it("should run the chosen command and report a history write failure", async () => {
    render(<Toaster />);
    const palette = mount("actions", []);
    const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    });
    onTestFinished(() => {
      write.mockRestore();
    });
    await palette.user.click(screen.getByRole("option", { name: "settings" }));

    expect(palette.closed).toStrictEqual([false]);
    expect(
      await screen.findByText("could not remember command")
    ).toBeInTheDocument();
    expect(screen.getByText("Storage is full")).toBeInTheDocument();
  });

  it("should remember a cancelled delete choice and still require confirmation", async () => {
    openNote("atlas.md");
    registerTabSnapshot(
      getTabState().activeId,
      createStore<TabSnapshot>(() => ({
        pinned: false,
        reason: undefined,
        sourceMode: false,
        status: "saved",
        tags: [],
        title: "Atlas",
        words: 1,
      }))
    );
    const palette = mount("actions", []);
    await palette.user.click(
      screen.getByRole("option", { name: "delete note..." })
    );
    await palette.user.keyboard("{Escape}");

    expect(
      within(screen.getByRole("group", { name: "recent" })).getByRole(
        "option",
        { name: "delete note..." }
      )
    ).toBeInTheDocument();
    await palette.user.click(
      screen.getByRole("option", { name: "delete note..." })
    );
    await waitFor(() => {
      expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
        "cancel"
      );
    });
    await palette.user.keyboard("{Enter}");
    expect(
      getTabState().tabs.some((tab) => tab.path === "atlas.md")
    ).toBeTruthy();
    expect(palette.closed).toStrictEqual([]);
  });

  it("should remember a command whose operation fails", async () => {
    mockIPC((command) => {
      if (command === "show_capture") {
        throw new Error("Capture is unavailable");
      }
      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(clearMocks);
    const palette = mount("actions", []);
    await palette.user.click(
      screen.getByRole("option", { name: "quick capture" })
    );
    expect(palette.closed).toStrictEqual([false]);
    palette.unmount();
    mount("actions", []);

    expect(
      within(screen.getByRole("group", { name: "recent" })).getByRole(
        "option",
        { name: "quick capture" }
      )
    ).toBeInTheDocument();
  });

  it("should keep a command in recent when its label changes", async () => {
    const palette = mount("actions", []);
    await palette.user.click(
      screen.getByRole("option", { name: "turn on focus mode" })
    );
    palette.unmount();
    const reopened = mount("actions", []);

    expect(
      within(screen.getByRole("group", { name: "recent" })).getByRole(
        "option",
        { name: "turn off focus mode" }
      )
    ).toBeInTheDocument();
    await reopened.user.click(
      screen.getByRole("option", { name: "turn off focus mode" })
    );
    expect(
      within(screen.getByRole("group", { name: "recent" })).getAllByRole(
        "option"
      )
    ).toHaveLength(1);
  });

  it("should leave command history alone when a workspace shortcut runs", async () => {
    const user = userEvent.setup();
    const client = new QueryClient();
    mockWindows("main");
    mockIPC((command) => {
      if (command.startsWith("plugin:")) {
        return 0;
      }
      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(() => {
      client.clear();
      clearMocks();
    });
    const workspace = render(
      <QueryClientProvider client={client}>
        <Workspace
          initialTabs={null}
          onFilterTag={() => {}}
          onOpenSearch={() => {}}
        />
      </QueryClientProvider>
    );
    await user.keyboard("{Control>}d{/Control}");
    workspace.unmount();
    const palette = mount("actions", []);

    expect(
      screen.getByRole("option", { name: "turn off focus mode" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "recent" })
    ).not.toBeInTheDocument();
    await palette.user.click(
      screen.getByRole("option", { name: "turn off focus mode" })
    );
  });
});

describe("steady palette searches", () => {
  it("should retain recent rows without opening them while a new search is pending", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const recent: NoteMeta = {
      createdAt: new Date(0),
      folder: "",
      path: "recent.md",
      pinned: false,
      snippet: null,
      tags: [],
      title: "Recent",
      updatedAt: new Date(0),
    };
    const found: NoteMeta = {
      createdAt: new Date(0),
      folder: "",
      path: "found.md",
      pinned: false,
      snippet: "Matching context",
      tags: [],
      title: "Found",
      updatedAt: new Date(0),
    };
    const palette = mount("find", [recent]);
    const read = Promise.withResolvers<NoteMeta[]>();
    const request = Promise.allSettled([
      palette.client.query({
        ...noteQueries.search(parseSearch("found")),
        queryFn: async () => await read.promise,
      }),
    ]);
    const row = screen.getByRole("option");
    fireEvent.change(palette.input, { target: { value: "found" } });
    expect(document.querySelector('[role="option"]')).toBe(row);
    expect(row?.textContent).toContain("Recent");
    expect(row?.getAttribute("aria-disabled")).toBe("true");
    expect(document.body.textContent).not.toContain("searching notes");
    fireEvent.click(row);
    act(() => {
      palette.input.focus();
    });
    fireEvent.keyDown(palette.input, { key: "Enter" });
    fireEvent.keyDown(palette.input, { key: "Enter", metaKey: true });
    expect(palette.closed).toStrictEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(document.querySelector('[role="option"]')).toBe(row);
    await act(async () => {
      read.resolve([found]);
      await request;
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(
      screen.getByRole("option", { selected: true }).textContent
    ).toContain("Found");
    expect(document.body.textContent).not.toContain("Recent");
    expect(palette.closed).toStrictEqual([]);
    fireEvent.keyDown(palette.input, { key: "Enter" });
    expect(palette.closed).toStrictEqual([false]);
    expect(
      getTabState().tabs.some((tab) => tab.path === "found.md")
    ).toBeTruthy();
  });

  it("should delay the footer spinner until a read takes 500ms and reset it for another query", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const palette = mount("find", []);
    const read = Promise.withResolvers<NoteMeta[]>();
    const request = Promise.allSettled([
      palette.client.query({
        ...noteQueries.search(parseSearch("slow")),
        queryFn: async () => await read.promise,
      }),
    ]);
    fireEvent.change(palette.input, { target: { value: "slow" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(149);
    });
    expect(
      screen.queryByRole("status", { name: "searching notes" })
    ).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(
      screen.queryByRole("status", { name: "searching notes" })
    ).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(
      screen.queryByRole("status", { name: "searching notes" })
    ).not.toBeNull();
    expect(
      document.querySelector('[cmdk-list] [aria-label="searching notes"]')
    ).toBeNull();
    expect(document.body.textContent).not.toContain("searching notes");
    palette.client.setQueryData(
      noteQueries.search(parseSearch("cached")).queryKey,
      []
    );
    fireEvent.change(palette.input, { target: { value: "cached" } });
    expect(
      screen.queryByRole("status", { name: "searching notes" })
    ).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(document.body.textContent).toContain('create "cached"');
    await act(async () => {
      read.resolve([]);
      await request;
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(
      screen.queryByRole("status", { name: "searching notes" })
    ).toBeNull();
    expect(document.body.textContent).toContain('create "cached"');
  });

  it("should ignore intermediate responses and restore recent notes immediately when cleared", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const recent: NoteMeta = {
      createdAt: new Date(0),
      folder: "",
      path: "recent.md",
      pinned: false,
      snippet: null,
      tags: [],
      title: "Recent",
      updatedAt: new Date(0),
    };
    const intermediate: NoteMeta = {
      createdAt: new Date(0),
      folder: "",
      path: "intermediate.md",
      pinned: false,
      snippet: null,
      tags: [],
      title: "Intermediate",
      updatedAt: new Date(0),
    };
    const palette = mount("find", [recent]);
    const firstRead = Promise.withResolvers<NoteMeta[]>();
    const firstRequest = Promise.allSettled([
      palette.client.query({
        ...noteQueries.search(parseSearch("first")),
        queryFn: async () => await firstRead.promise,
      }),
    ]);
    const lastRead = Promise.withResolvers<NoteMeta[]>();
    const lastRequest = Promise.allSettled([
      palette.client.query({
        ...noteQueries.search(parseSearch("last")),
        queryFn: async () => await lastRead.promise,
      }),
    ]);
    fireEvent.change(palette.input, { target: { value: "first" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    fireEvent.change(palette.input, { target: { value: "last" } });
    await act(async () => {
      firstRead.resolve([intermediate]);
      await firstRequest;
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(document.body.textContent).toContain("Recent");
    expect(document.body.textContent).not.toContain("Intermediate");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(149);
    });
    expect(document.body.textContent).not.toContain("Intermediate");
    fireEvent.change(palette.input, { target: { value: "" } });
    expect(
      document.querySelector('[role="option"]')?.getAttribute("aria-disabled")
    ).toBe("false");
    expect(document.body.textContent).toContain("Recent");
    await act(async () => {
      lastRead.resolve([intermediate]);
      await lastRequest;
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(document.body.textContent).not.toContain("Intermediate");
    expect(
      screen.queryByRole("status", { name: "searching notes" })
    ).toBeNull();
  });

  it("should show current filter choices immediately after a failed search", async () => {
    const note: NoteMeta = {
      createdAt: new Date(0),
      folder: "work",
      path: "work/note.md",
      pinned: false,
      snippet: null,
      tags: [],
      title: "Note",
      updatedAt: new Date(0),
    };
    const palette = mount("find", [note]);
    const key = noteQueries.search(parseSearch("broken")).queryKey;
    palette.client.setQueryData(key, []);
    palette.client
      .getQueryCache()
      .find({ queryKey: key })
      ?.setState({ error: new Error("index unavailable"), status: "error" });
    await palette.user.clear(palette.input);
    await palette.user.type(palette.input, "broken");
    await waitFor(() => {
      expect(document.body.textContent).toContain("index unavailable");
    });
    await palette.user.clear(palette.input);
    await palette.user.type(palette.input, "folder:");
    expect(document.querySelector('[role="option"]')?.textContent).toContain(
      "notes root"
    );
    expect(document.body.textContent).not.toContain("index unavailable");
    expect(document.body.textContent).not.toContain("incomplete filter");
  });
});

describe("command palette", () => {
  it("should search while the full note list is pending without treating it as empty", async () => {
    const list = Promise.withResolvers<[]>();
    mockIPC(async (command) => {
      if (command === "list_notes") {
        return await list.promise;
      }
      if (command === "search_notes") {
        return [
          {
            createdAt: 1,
            folder: "",
            path: "found.md",
            pinned: false,
            snippet: "matched words",
            tags: [],
            title: "Found",
            updatedAt: 1,
          },
        ];
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    onTestFinished(async () => {
      act(() => {
        list.resolve([]);
      });
      client.clear();
      clearMocks();
    });
    const onOpenChange = vi.fn<(open: boolean) => void>();
    const onOpenSettings = vi.fn<() => void>();
    render(
      <QueryClientProvider client={client}>
        <CommandPalette
          mode="find"
          notesDir="/notes"
          onOpenChange={onOpenChange}
          onOpenSettings={onOpenSettings}
          open
        />
      </QueryClientProvider>
    );
    expect(screen.queryByText("nothing found")).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByRole("combobox"), "needle");
    expect(
      await screen.findByRole("option", { name: FOUND_NOTE })
    ).toBeInTheDocument();
  });

  it("should report a failed first note list and retry without offering creation", async () => {
    let attempts = 0;
    mockIPC((command) => {
      if (command !== "list_notes") {
        throw new Error(`unexpected command: ${command}`);
      }
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("index unavailable"), { kind: "failed" });
      }
      return [];
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    onTestFinished(() => {
      client.clear();
      clearMocks();
    });
    const onOpenChange = vi.fn<(open: boolean) => void>();
    const onOpenSettings = vi.fn<() => void>();
    render(
      <QueryClientProvider client={client}>
        <CommandPalette
          mode="find"
          notesDir="/notes"
          onOpenChange={onOpenChange}
          onOpenSettings={onOpenSettings}
          open
        />
      </QueryClientProvider>
    );
    expect(
      await screen.findByText("could not search notes")
    ).toBeInTheDocument();
    expect(screen.getByText("index unavailable")).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: CREATE_NOTE })
    ).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "retry" }));
    expect(await screen.findByText("nothing found")).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});

describe("recent note results", () => {
  beforeEach(() => {
    for (const tab of getTabState().tabs) {
      closeTab(tab.id);
    }
    localStorage.clear();
    onTestFinished(() => {
      for (const tab of getTabState().tabs) {
        closeTab(tab.id);
      }
      clearMocks();
    });
  });

  it("should rank the full list and exclude the showing note before taking twenty", async () => {
    const notes: NoteMeta[] = Array.from({ length: 23 }, (_, index) => ({
      createdAt: new Date(0),
      folder: "",
      path: `${index}.md`,
      pinned: index === 21,
      snippet: null,
      tags: [],
      title: `Note ${index}`,
      updatedAt: new Date(100 - index),
    }));
    openNote("0.md");
    rememberNote("/notes", "22.md");
    const palette = mount("find", notes);
    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(20);
    });
    expect(
      screen.getAllByRole("option").map((row) => row.dataset.value)
    ).toStrictEqual([
      "21.md",
      "22.md",
      ...Array.from({ length: 18 }, (_, index) => `${index + 1}.md`),
    ]);
    expect(
      screen.queryByRole("option", { name: "Note 0" })
    ).not.toBeInTheDocument();
    palette.client.setQueryData(
      noteQueries.search(parseSearch("Note 0")).queryKey,
      notes.slice(0, 1)
    );
    await palette.user.type(palette.input, "Note 0");
    expect(
      await screen.findByRole("option", { name: "Note 0" })
    ).toBeInTheDocument();
  });

  it("should keep rows and selection steady through refresh, remove deletions, and rank again after clearing", async () => {
    const notes: NoteMeta[] = [
      {
        createdAt: new Date(0),
        folder: "",
        path: "a.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "A",
        updatedAt: new Date(3),
      },
      {
        createdAt: new Date(0),
        folder: "",
        path: "b.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "B",
        updatedAt: new Date(2),
      },
      {
        createdAt: new Date(0),
        folder: "",
        path: "c.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "C",
        updatedAt: new Date(1),
      },
    ];
    const palette = mount("find", notes);
    await waitFor(() =>
      expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
        "A"
      )
    );
    await palette.user.keyboard("{ArrowDown}");
    const updated = notes.map((note) => ({
      ...note,
      title: `${note.title} refreshed`,
      updatedAt: new Date(note.path === "c.md" ? 100 : 0),
    }));
    act(() => {
      palette.client.setQueryData(noteQueries.list().queryKey, updated);
    });
    await screen.findByRole("option", { name: "C refreshed" });
    expect(
      screen.getAllByRole("option").map((row) => row.dataset.value)
    ).toStrictEqual(["a.md", "b.md", "c.md"]);
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
      "B refreshed"
    );
    act(() => {
      palette.client.setQueryData(
        noteQueries.list().queryKey,
        updated.filter((note) => note.path !== "a.md")
      );
    });
    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(2);
    });
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
      "B refreshed"
    );
    palette.client.setQueryData(
      noteQueries.search(parseSearch("nothing")).queryKey,
      []
    );
    await palette.user.type(palette.input, "nothing");
    await screen.findByRole("option", { name: /create/u });
    await palette.user.clear(palette.input);
    expect(
      screen.getAllByRole("option").map((row) => row.dataset.value)
    ).toStrictEqual(["c.md", "b.md"]);
    expect(readRecentNotes("/notes")).toStrictEqual([]);
    rememberNote("/notes", "b.md");
    const held = Promise.withResolvers<NoteMeta[]>();
    const pending = Promise.allSettled([
      palette.client.query({
        ...noteQueries.search(parseSearch("waiting")),
        queryFn: async () => await held.promise,
      }),
    ]);
    onTestFinished(async () => {
      held.resolve([]);
      await pending;
    });
    await palette.user.type(palette.input, "waiting");
    expect(screen.getByRole("option", { name: "C refreshed" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    await palette.user.clear(palette.input);
    expect(
      screen.getAllByRole("option").map((row) => row.dataset.value)
    ).toStrictEqual(["b.md", "c.md"]);
  });

  it("should offer no creation when the showing note is the only note", () => {
    openNote("only.md");
    mount("find", [
      {
        createdAt: new Date(0),
        folder: "",
        path: "only.md",
        pinned: true,
        snippet: null,
        tags: [],
        title: "Only",
        updatedAt: new Date(0),
      },
    ]);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByText("nothing found")).toBeInTheDocument();
  });

  it("should remove a deleted note from history after confirmation", async () => {
    mockIPC((command) => {
      if (command === "delete_note") {
        return { path: "gone.md", warnings: [] };
      }
      if (command.startsWith("plugin:")) {
        return 0;
      }
      throw new Error(`unexpected command: ${command}`);
    });
    openNote("gone.md");
    registerTabSnapshot(
      getTabState().activeId,
      createStore<TabSnapshot>(() => ({
        pinned: false,
        reason: undefined,
        sourceMode: false,
        status: "saved",
        tags: [],
        title: "Gone",
        words: 1,
      }))
    );
    rememberNote("/notes", "gone.md");
    const palette = mount("actions", []);
    await palette.user.click(
      screen.getByRole("option", { name: "delete note..." })
    );
    await palette.user.click(
      screen.getByRole("option", { name: "delete forever" })
    );
    await waitFor(() => {
      expect(getTabState().tabs).toStrictEqual([]);
    });
    expect(readRecentNotes("/notes")).toStrictEqual([]);
  });
});
