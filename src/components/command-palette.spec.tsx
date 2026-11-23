import { setTimeout as sleep } from "node:timers/promises";

import { Dialog } from "@base-ui/react/dialog";
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
import { createElement, Suspense } from "react";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { Toaster } from "@/components/ui/toast";
import { Workspace } from "@/components/workspace/workspace";
import { SNIPPET_END, SNIPPET_START } from "@/core/fts-markers";
import type { NoteMeta } from "@/core/notes";
import { parseSearch } from "@/core/search";
import { appearanceQuery, noteQueries, themeQuery } from "@/data/queries";
import { createQueryClient } from "@/lib/query-client";
import { readRecentNotes, rememberNote } from "@/lib/recent-notes";
import type { TabSnapshot } from "@/lib/tabs/store";
import {
  closeTab,
  getTabState,
  openNote,
  openTab,
  registerTabHandles,
  registerTabSnapshot,
} from "@/lib/tabs/store";
import { noteFind } from "@/lib/ui/find";
import { closeNoteBrowser } from "@/lib/ui/note-browser";

import { CommandPalette } from "./command-palette";
import { SettingsDialog } from "./settings-dialog";

const FOUND_NOTE = /Found/u;
const CREATE_NOTE = /create/u;

function mount(mode: "actions" | "find", notes: NoteMeta[]) {
  const user = userEvent.setup();

  const client = createQueryClient();

  client.setQueryData(noteQueries.list().queryKey, notes);
  // A disk holding these notes holds their folders and every ancestor.
  client.setQueryData(noteQueries.folders().queryKey, [
    ...new Set(
      notes.flatMap(({ folder }) =>
        folder
          .split("/")
          .filter((part) => part !== "")
          .map((_, index, parts) => parts.slice(0, index + 1).join("/"))
      )
    ),
  ]);
  client.setQueryData(noteQueries.tags().queryKey, [{ count: 1, tag: "work" }]);
  client.setQueryData(appearanceQuery.queryKey, "auto");
  client.setQueryData(themeQuery.queryKey, "inki");
  const closed: boolean[] = [];
  onTestFinished(() => {
    client.clear();
  });

  const { unmount } = render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(CommandPalette, {
        handle: Dialog.createHandle(),
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

  it("should open a title hit without find", async () => {
    const palette = mount("find", []);
    palette.client.setQueryData(
      noteQueries.search(parseSearch("road")).queryKey,
      [
        {
          createdAt: new Date(0),
          folder: "",
          path: "roadmap.md",
          pinned: false,
          snippet: "the planning doc",
          tags: [],
          title: `${SNIPPET_START}Roadmap${SNIPPET_END}`,
          updatedAt: new Date(0),
        },
      ]
    );
    await palette.user.clear(palette.input);
    await palette.user.type(palette.input, "road");
    await palette.user.click(
      await screen.findByRole("option", { name: /Roadmap/u })
    );
    expect(
      getTabState().tabs.some((tab) => tab.path === "roadmap.md")
    ).toBeTruthy();
    expect(noteFind.store.state.open).toBeFalsy();
  });

  it("should open a title hit without find when its body also matches", async () => {
    const palette = mount("find", []);
    palette.client.setQueryData(
      noteQueries.search(parseSearch("road")).queryKey,
      [
        {
          createdAt: new Date(0),
          folder: "",
          path: "roadmap.md",
          pinned: false,
          snippet: `${SNIPPET_START}Roadmap${SNIPPET_END}\nthe planning doc`,
          tags: [],
          title: `${SNIPPET_START}Roadmap${SNIPPET_END}`,
          updatedAt: new Date(0),
        },
      ]
    );
    await palette.user.clear(palette.input);
    await palette.user.type(palette.input, "road");
    await palette.user.click(
      await screen.findByRole("option", { name: /Roadmap/u })
    );
    expect(
      getTabState().tabs.some((tab) => tab.path === "roadmap.md")
    ).toBeTruthy();
    expect(noteFind.store.state.open).toBeFalsy();
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
  it("should take a note in a folder out of it through the showing session", async () => {
    openNote("projects/atlas.md");
    registerTabSnapshot(
      getTabState().activeId,
      createStore<TabSnapshot>(() => ({
        pinned: false,
        reason: undefined,
        sourceMode: false,
        status: "saved",
        tags: [],
        title: "Atlas",
      }))
    );
    const changes: unknown[] = [];
    registerTabHandles(getTabState().activeId, {
      changePath: async (change) => {
        changes.push(change);
      },
      exportPdf: async () => null,
      focus: () => {},
      getCaret: () => 0,
      insertText: () => {},
      setSource: () => {},
    });
    const palette = mount("actions", []);
    await palette.user.click(
      screen.getByRole("option", { name: "remove from folder" })
    );
    expect(changes).toStrictEqual([{ folder: "", kind: "move" }]);
    expect(palette.closed).toStrictEqual([false]);
  });

  it("should not offer remove from folder for a note outside any folder", () => {
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
      }))
    );
    mount("actions", []);
    expect(
      screen.getByRole("option", { name: "move to folder…" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "remove from folder" })
    ).not.toBeInTheDocument();
  });

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
      focus: () => {},
      getCaret: () => 0,
      insertText: () => {},
      setSource: () => {},
    });
    const palette = mount("actions", []);
    await palette.user.type(palette.input, "export");
    expect(document.body.textContent).toContain("export pdf…");
    await palette.user.keyboard("{Enter}");
    expect(exportPdf).toHaveBeenCalledOnce();
    expect(palette.closed).toStrictEqual([false]);
  });

  it("should open a csv tab's file in the default app, and offer that for no other tab", async () => {
    const opened: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "open_csv") {
        opened.push(args);

        return null;
      }

      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(() => {
      clearMocks();
    });

    openNote("projects/atlas.md");
    const note = mount("actions", []);
    await note.user.type(note.input, "default app");
    expect(document.body.textContent).toContain("nothing found");
    note.unmount();

    openTab("csv", "/notes/attachments/q3.csv", true);
    const palette = mount("actions", []);
    await palette.user.type(palette.input, "default app");
    expect(document.body.textContent).toContain("open in default app");
    await palette.user.keyboard("{Enter}");
    await waitFor(() => {
      expect(opened).toStrictEqual([{ path: "/notes/attachments/q3.csv" }]);
    });
    expect(palette.closed).toStrictEqual([false]);
  });

  it("should open a code tab's file in the default app", async () => {
    const opened: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "open_code") {
        opened.push(args);

        return null;
      }

      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(() => {
      clearMocks();
    });

    openTab("code", "/notes/attachments/config.json", true);
    const palette = mount("actions", []);
    await palette.user.type(palette.input, "default app");
    expect(document.body.textContent).toContain("open in default app");
    await palette.user.keyboard("{Enter}");
    await waitFor(() => {
      expect(opened).toStrictEqual([
        { path: "/notes/attachments/config.json" },
      ]);
    });
    expect(palette.closed).toStrictEqual([false]);
  });

  it("should reveal a csv tab's file by the path it holds", async () => {
    const revealed: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "plugin:opener|reveal_item_in_dir") {
        revealed.push(args);

        return null;
      }

      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(() => {
      clearMocks();
    });

    openTab("csv", "/Users/me/q3.csv", true);
    const palette = mount("actions", []);
    await palette.user.type(palette.input, "reveal");
    await palette.user.keyboard("{Enter}");

    await waitFor(() => {
      expect(revealed).toStrictEqual([{ paths: ["/Users/me/q3.csv"] }]);
    });
  });

  it("should offer no pdf export away from macOS", async () => {
    openNote("projects/atlas.md");
    registerTabHandles(getTabState().activeId, {
      exportPdf: async () => null,
      focus: () => {},
      getCaret: () => 0,
      insertText: () => {},
      setSource: () => {},
    });
    const palette = mount("actions", []);
    await palette.user.type(palette.input, "export");
    expect(document.body.textContent).not.toContain("export pdf");
    expect(document.body.textContent).toContain("nothing found");
  });

  it("should keep the showing tab's rows while the palette fades out", async () => {
    openNote("atlas.md");
    const tab = getTabState().activeId;
    registerTabSnapshot(
      tab,
      createStore<TabSnapshot>(() => ({
        pinned: false,
        reason: undefined,
        sourceMode: true,
        status: "saved",
        tags: [],
        title: "Atlas",
      }))
    );

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });

    client.setQueryData(noteQueries.list().queryKey, []);
    client.setQueryData(noteQueries.folders().queryKey, []);
    client.setQueryData(noteQueries.tags().queryKey, []);
    client.setQueryData(appearanceQuery.queryKey, "auto");
    client.setQueryData(themeQuery.queryKey, "inki");
    onTestFinished(() => {
      closeTab(tab);
      client.clear();
    });

    const handle = Dialog.createHandle();

    const { rerender } = render(
      <QueryClientProvider client={client}>
        <CommandPalette
          handle={handle}
          mode="actions"
          notesDir="/notes"
          onOpenChange={() => {}}
          onOpenSettings={() => {}}
          open
        />
      </QueryClientProvider>
    );

    const fade = screen
      .getByRole("dialog")
      .animate([{ opacity: 1 }, { opacity: 0 }], 60_000);

    rerender(
      <QueryClientProvider client={client}>
        <CommandPalette
          handle={handle}
          mode="actions"
          notesDir="/notes"
          onOpenChange={() => {}}
          onOpenSettings={() => {}}
          open={false}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText("turn off markdown source")).toBeInTheDocument();
    expect(screen.getByText("pin note")).toBeInTheDocument();
    act(() => {
      fade.finish();
    });
    await waitFor(() => {
      expect(screen.queryByText("pin note")).not.toBeInTheDocument();
    });
  });
});

describe("recent commands", () => {
  beforeEach(() => {
    localStorage.removeItem("recent-actions");
    closeNoteBrowser();

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
        "browse notes",
        "new note",
        "reopen last closed tab",
        "quick capture",
        "settings",
        "catppuccin theme",
        "reindex library",
        "check for updates…",
        "browse folders",
        "browse tags",
        "browse recent",
        "browse pinned",
      ]);
    }
  );

  it("should switch to the chosen appearance and stop offering it", async () => {
    // happy-dom does not report macOS, and the rows exist only there.
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const saved: unknown[] = [];
    mockIPC((command, payload) => {
      if (command === "set_appearance") {
        saved.push(payload);

        return null;
      }

      if (command === "get_appearance") {
        return "dark";
      }

      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(() => {
      clearMocks();
    });
    const palette = mount("actions", []);

    await palette.user.click(
      screen.getByRole("option", { name: "dark appearance" })
    );

    expect(saved).toStrictEqual([{ appearance: "dark" }]);
    expect(palette.closed).toStrictEqual([false]);
    expect(
      await screen.findByRole("option", { name: "auto appearance" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "dark appearance" })
    ).not.toBeInTheDocument();
  });

  it("should offer only the other scheme on auto", () => {
    // happy-dom does not report macOS, and the rows exist only there.
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    mount("actions", []);

    expect(
      screen.getByRole("option", { name: "dark appearance" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "light appearance" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "auto appearance" })
    ).not.toBeInTheDocument();
  });

  it("should offer the other scheme and auto when dark is pinned", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    // happy-dom paints light; a pinned dark puts dark on screen.
    vi.stubGlobal("matchMedia", (media: string) => ({
      addEventListener: () => {},
      matches: media === "(prefers-color-scheme: dark)",
      media,
      removeEventListener: () => {},
    }));
    onTestFinished(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });
    const palette = mount("actions", []);

    palette.client.setQueryData(appearanceQuery.queryKey, "dark");

    expect(
      await screen.findByRole("option", { name: "auto appearance" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "light appearance" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "dark appearance" })
    ).not.toBeInTheDocument();
  });

  it("should offer no appearance away from macOS", async () => {
    const palette = mount("actions", []);

    await palette.user.type(palette.input, "appearance");

    expect(document.body.textContent).not.toContain("appearance ");
    expect(document.body.textContent).toContain("nothing found");
  });

  it("should switch to the chosen theme and stop offering it", async () => {
    const saved: unknown[] = [];
    mockIPC((command, payload) => {
      if (command === "set_theme") {
        saved.push(payload);

        return null;
      }

      if (command === "get_theme") {
        return "catppuccin";
      }

      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(() => {
      clearMocks();
    });
    const palette = mount("actions", []);

    expect(
      screen.queryByRole("option", { name: "inki theme" })
    ).not.toBeInTheDocument();

    await palette.user.click(
      screen.getByRole("option", { name: "catppuccin theme" })
    );

    expect(saved).toStrictEqual([{ theme: "catppuccin" }]);
    expect(palette.closed).toStrictEqual([false]);
    expect(
      await screen.findByRole("option", { name: "inki theme" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "catppuccin theme" })
    ).not.toBeInTheDocument();
  });

  it("should send a palette theme pick after a settings pick still saving", async () => {
    const firstSave = Promise.withResolvers<null>();
    const calls: unknown[] = [];
    mockIPC(async (command, payload) => {
      if (command === "set_theme") {
        calls.push(payload);

        return calls.length === 1 ? await firstSave.promise : null;
      }

      if (command === "get_theme") {
        return "inki";
      }

      if (command.startsWith("plugin:")) {
        return false;
      }

      throw new Error(`unexpected command: ${command}`);
    });
    const client = createQueryClient();
    client.setQueryData(noteQueries.list().queryKey, []);
    client.setQueryData(noteQueries.folders().queryKey, []);
    client.setQueryData(noteQueries.tags().queryKey, []);
    client.setQueryData(appearanceQuery.queryKey, "auto");
    client.setQueryData(themeQuery.queryKey, "inki");
    onTestFinished(() => {
      client.clear();
      clearMocks();
    });

    const screenWith = (dialog: "palette" | "settings") => (
      <QueryClientProvider client={client}>
        <SettingsDialog
          notesDir="/notes"
          onOpenChange={() => {}}
          open={dialog === "settings"}
        />
        <CommandPalette
          handle={Dialog.createHandle()}
          mode="actions"
          notesDir="/notes"
          onOpenChange={() => {}}
          onOpenSettings={() => {}}
          open={dialog === "palette"}
        />
      </QueryClientProvider>
    );

    const { rerender } = render(screenWith("settings"));
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "catppuccin" }));
    rerender(screenWith("palette"));
    await user.click(await screen.findByRole("option", { name: "inki theme" }));
    await sleep(50);

    expect(calls).toStrictEqual([{ theme: "catppuccin" }]);

    firstSave.resolve(null);

    await waitFor(() => {
      expect(calls).toStrictEqual([{ theme: "catppuccin" }, { theme: "inki" }]);
    });
  });

  it("should report a theme that cannot be saved and keep offering it", async () => {
    mockIPC((command) => {
      if (command === "set_theme") {
        throw Object.assign(new Error("The theme could not be saved"), {
          kind: "failed",
        });
      }

      if (command === "get_theme") {
        return "inki";
      }

      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(() => {
      clearMocks();
    });
    render(<Toaster />);
    const palette = mount("actions", []);

    await palette.user.click(
      screen.getByRole("option", { name: "catppuccin theme" })
    );

    expect(
      await screen.findByText("could not change theme")
    ).toBeInTheDocument();
    expect(
      screen.getByText("The theme could not be saved")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "catppuccin theme" })
    ).toBeInTheDocument();
  });

  it("should offer and run commands when recent history cannot be read", async () => {
    const getItem = localStorage.getItem.bind(localStorage);

    const read = vi.spyOn(localStorage, "getItem").mockImplementation((key) => {
      if (key === "recent-actions") {
        throw new DOMException("Storage access is denied", "SecurityError");
      }

      return getItem(key);
    });

    onTestFinished(() => {
      read.mockRestore();
    });
    const palette = mount("actions", []);

    expect(
      screen.queryByRole("group", { name: "recent" })
    ).not.toBeInTheDocument();
    await palette.user.click(screen.getByRole("option", { name: "settings" }));
    expect(palette.closed).toStrictEqual([false]);
  });

  it("should log a recent history read failure", async () => {
    const logged: { args: unknown; command: string }[] = [];
    mockIPC((command, args) => {
      logged.push({ args, command });
    });
    const getItem = localStorage.getItem.bind(localStorage);

    const read = vi.spyOn(localStorage, "getItem").mockImplementation((key) => {
      if (key === "recent-actions") {
        throw new DOMException("Storage access is denied", "SecurityError");
      }

      return getItem(key);
    });

    onTestFinished(() => {
      read.mockRestore();
      clearMocks();
    });
    mount("actions", []);

    await waitFor(() => {
      expect(
        logged.filter(({ command }) => command === "plugin:log|log")
      ).toMatchObject([
        {
          args: {
            message: "could not read recent commands: Storage access is denied",
          },
          command: "plugin:log|log",
        },
      ]);
    });
  });

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
      }))
    );
    const initial = mount("actions", []);
    const usual = screen.getAllByRole("option").map((row) => row.textContent);
    initial.unmount();

    for (const name of [
      "settings",
      "settings",
      "settings",
      "rename note…",
      "move to folder…",
      "delete note…",
      "edit tags…",
      "show links to this note…",
    ]) {
      const palette = mount("actions", []);
      // oxlint-disable-next-line no-await-in-loop -- choices must finish in order to establish recency
      await palette.user.click(screen.getByRole("option", { name }));
      palette.unmount();
    }

    const palette = mount("actions", []);

    const recent = [
      "show links to this note…",
      "edit tags…",
      "delete note…",
      "move to folder…",
      "rename note…",
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
      "show links to this note…",
      "edit tags…",
      "delete note…",
      "move to folder…",
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
      screen.queryByRole("option", { name: "rename note…" })
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
        "show-links",
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
      }))
    );
    const palette = mount("actions", []);
    await palette.user.click(
      screen.getByRole("option", { name: "delete note…" })
    );
    await palette.user.keyboard("{Escape}");

    expect(
      within(screen.getByRole("group", { name: "recent" })).getByRole(
        "option",
        { name: "delete note…" }
      )
    ).toBeInTheDocument();
    await palette.user.click(
      screen.getByRole("option", { name: "delete note…" })
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

  it("should name the browser toggle for its next action and retain its recent command", async () => {
    closeNoteBrowser();
    onTestFinished(() => {
      act(closeNoteBrowser);
      localStorage.removeItem("note-browser-open");
    });
    const palette = mount("actions", []);
    await palette.user.click(
      screen.getByRole("option", { name: "browse notes" })
    );
    expect(localStorage.getItem("note-browser-open")).toBe("true");
    expect(palette.closed).toStrictEqual([false]);
    palette.unmount();
    const reopened = mount("actions", []);
    expect(
      within(screen.getByRole("group", { name: "recent" })).getByRole(
        "option",
        { name: "close note browser" }
      )
    ).toBeInTheDocument();
    await reopened.user.type(reopened.input, "close note browser");
    await reopened.user.click(
      screen.getByRole("option", { name: "close note browser" })
    );
    expect(localStorage.getItem("note-browser-open")).toBe("false");
    expect(reopened.closed).toStrictEqual([false]);
    reopened.unmount();
    mount("actions", []);
    expect(
      within(screen.getByRole("group", { name: "recent" })).getAllByRole(
        "option"
      )
    ).toHaveLength(1);
    expect(
      screen.getByRole("option", { name: "browse notes" })
    ).toBeInTheDocument();
  });

  it("should leave command history alone when a workspace shortcut runs", async () => {
    closeNoteBrowser();
    onTestFinished(() => {
      act(closeNoteBrowser);
      localStorage.removeItem("note-browser-open");
    });
    const user = userEvent.setup();
    const client = new QueryClient();
    mockWindows("main");
    mockIPC((command) => {
      if (command === "get_notes_dir") {
        return "/notes";
      }

      if (command === "index_status") {
        return { state: "ready" };
      }

      if (command === "list_notes") {
        return [];
      }

      if (command.startsWith("plugin:")) {
        return 0;
      }

      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(() => {
      client.clear();
      clearMocks();
    });

    // Home suspends on the notes directory, which the layout owns in the app.
    const workspace = render(
      <QueryClientProvider client={client}>
        <Suspense fallback={null}>
          <Workspace
            onOpenSearch={() => {}}
            searchTrigger={Dialog.createHandle()}
          />
        </Suspense>
      </QueryClientProvider>
    );

    await screen.findByRole("button", { name: "browse notes" });
    await user.keyboard("{Control>}\\{/Control}");
    workspace.unmount();
    const palette = mount("actions", []);

    expect(
      screen.getByRole("option", { name: "close note browser" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "recent" })
    ).not.toBeInTheDocument();
    await palette.user.click(
      screen.getByRole("option", { name: "close note browser" })
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

    mockIPC((command) => {
      if (command === "search_notes") {
        throw Object.assign(new Error("index unavailable"), {
          kind: "failed",
        });
      }

      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(() => {
      clearMocks();
    });
    const palette = mount("find", [note]);
    await palette.user.clear(palette.input);
    await palette.user.type(palette.input, "broken");
    await waitFor(() => {
      expect(document.body.textContent).toContain("index unavailable");
    });
    await palette.user.clear(palette.input);
    await palette.user.type(palette.input, "folder:");
    expect(document.querySelector('[role="option"]')?.textContent).toContain(
      "work"
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
          handle={Dialog.createHandle()}
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
          handle={Dialog.createHandle()}
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

  it("should retry the failed recent list after switching to search results", async () => {
    render(<Toaster />);
    let listReads = 0;
    let searchReads = 0;
    mockIPC((command) => {
      if (command === "list_notes") {
        listReads += 1;

        if (listReads === 1) {
          throw Object.assign(new Error("the disk is busy"), {
            kind: "failed",
          });
        }

        return [
          {
            createdAt: 0,
            folder: "",
            path: "recent.md",
            pinned: false,
            snippet: null,
            tags: [],
            title: "Refreshed recent note",
            updatedAt: 1,
          },
        ];
      }

      if (command === "search_notes") {
        searchReads += 1;

        return [
          {
            createdAt: 0,
            folder: "",
            path: "found.md",
            pinned: false,
            snippet: "Matching context",
            tags: [],
            title: "Found",
            updatedAt: 0,
          },
        ];
      }

      throw new Error(`unexpected command: ${command}`);
    });

    const palette = mount("find", [
      {
        createdAt: new Date(0),
        folder: "",
        path: "recent.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Recent",
        updatedAt: new Date(0),
      },
    ]);

    await screen.findByRole("option", { name: "Recent" });
    await act(async () => {
      await palette.client.invalidateQueries({
        queryKey: noteQueries.list().queryKey,
      });
    });
    await screen.findByText("could not refresh the note list");
    await palette.user.type(palette.input, "found");
    await screen.findByRole("option", { name: FOUND_NOTE });

    await palette.user.click(screen.getByRole("button", { name: "retry" }));

    await waitFor(() => {
      expect(listReads).toBe(2);
    });
    expect(searchReads).toBe(1);
    expect(screen.getByRole("option", { name: FOUND_NOTE })).toBeVisible();
    await palette.user.clear(palette.input);
    expect(
      await screen.findByRole("option", {
        name: "Refreshed recent note",
      })
    ).toBeVisible();
    expect(listReads).toBe(2);
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
    await waitFor(() => {
      expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
        "A"
      );
    });
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
      }))
    );
    rememberNote("/notes", "gone.md");
    const palette = mount("actions", []);
    await palette.user.click(
      screen.getByRole("option", { name: "delete note…" })
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

describe("links to this note", () => {
  it("should keep the links listed when the search for unlinked mentions fails", async () => {
    openNote("atlas.md");
    const tab = getTabState().activeId;
    registerTabSnapshot(
      tab,
      createStore<TabSnapshot>(() => ({
        pinned: false,
        reason: undefined,
        sourceMode: false,
        status: "saved",
        tags: [],
        title: "Atlas",
      }))
    );
    onTestFinished(() => {
      closeTab(tab);
    });

    const bee: NoteMeta = {
      createdAt: new Date(0),
      folder: "",
      path: "bee.md",
      pinned: false,
      snippet: null,
      tags: [],
      title: "Bee",
      updatedAt: new Date(0),
    };

    const palette = mount("actions", []);
    palette.client.setQueryData(
      noteQueries.graph({ kind: "note", path: "atlas.md" }).queryKey,
      {
        mentionsError: { kind: "failed", message: "the disk is busy" },
        picture: {
          dangling: [],
          hubs: [],
          incoming: [
            { lines: [{ at: 4, context: "see Atlas", line: 1 }], note: bee },
          ],
          kind: "note",
          note: { ...bee, path: "atlas.md", title: "Atlas" },
          outgoing: [],
        },
      }
    );

    await palette.user.click(
      screen.getByRole("option", { name: "show links to this note…" })
    );

    expect(screen.getByRole("option", { name: /Bee/u })).toBeInTheDocument();
    expect(screen.getByText("the disk is busy")).toBeInTheDocument();
  });

  it("should say no notes link here for a note the index does not hold", async () => {
    openNote("atlas.md");
    const tab = getTabState().activeId;
    registerTabSnapshot(
      tab,
      createStore<TabSnapshot>(() => ({
        pinned: false,
        reason: undefined,
        sourceMode: false,
        status: "saved",
        tags: [],
        title: "Atlas",
      }))
    );
    onTestFinished(() => {
      closeTab(tab);
    });

    const palette = mount("actions", []);
    palette.client.setQueryData(
      noteQueries.graph({ kind: "note", path: "atlas.md" }).queryKey,
      { mentionsError: null, picture: undefined }
    );

    await palette.user.click(
      screen.getByRole("option", { name: "show links to this note…" })
    );

    expect(screen.getByText("no notes link here")).toBeInTheDocument();
  });

  it("should say why the links failed and load them again on retry", async () => {
    openNote("atlas.md");
    const tab = getTabState().activeId;
    registerTabSnapshot(
      tab,
      createStore<TabSnapshot>(() => ({
        pinned: false,
        reason: undefined,
        sourceMode: false,
        status: "saved",
        tags: [],
        title: "Atlas",
      }))
    );
    let reads = 0;
    mockIPC((command) => {
      if (command === "read_graph") {
        reads += 1;

        if (reads === 1) {
          throw Object.assign(new Error("the disk is busy"), {
            kind: "failed",
          });
        }

        return {
          mentionsError: null,
          picture: {
            graph: {
              dangling: [],
              hubs: [],
              incoming: [
                {
                  lines: [{ at: 4, context: "see Atlas", line: 1 }],
                  note: {
                    createdAt: 0,
                    folder: "",
                    path: "bee.md",
                    pinned: false,
                    snippet: null,
                    tags: [],
                    title: "Bee",
                    updatedAt: 0,
                  },
                },
              ],
              outgoing: [],
            },
            kind: "note",
            note: {
              createdAt: 0,
              folder: "",
              path: "atlas.md",
              pinned: false,
              snippet: null,
              tags: [],
              title: "Atlas",
              updatedAt: 0,
            },
          },
        };
      }

      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(() => {
      closeTab(tab);
      clearMocks();
    });

    const palette = mount("actions", []);

    await palette.user.click(
      screen.getByRole("option", { name: "show links to this note…" })
    );

    expect(await screen.findByText("could not load links")).toBeInTheDocument();
    expect(screen.getByText("the disk is busy")).toBeInTheDocument();

    await palette.user.click(screen.getByRole("button", { name: "retry" }));

    expect(
      await screen.findByRole("option", { name: /Bee/u })
    ).toBeInTheDocument();
    expect(screen.queryByText("could not load links")).not.toBeInTheDocument();
  });

  it("should clear the unlinked mention failure on retry and keep the links", async () => {
    openNote("atlas.md");
    const tab = getTabState().activeId;
    registerTabSnapshot(
      tab,
      createStore<TabSnapshot>(() => ({
        pinned: false,
        reason: undefined,
        sourceMode: false,
        status: "saved",
        tags: [],
        title: "Atlas",
      }))
    );
    mockIPC((command) => {
      if (command === "read_graph") {
        return {
          mentionsError: null,
          picture: {
            graph: {
              dangling: [],
              hubs: [],
              incoming: [
                {
                  lines: [{ at: 4, context: "see Atlas", line: 1 }],
                  note: {
                    createdAt: 0,
                    folder: "",
                    path: "bee.md",
                    pinned: false,
                    snippet: null,
                    tags: [],
                    title: "Bee",
                    updatedAt: 0,
                  },
                },
              ],
              outgoing: [],
            },
            kind: "note",
            note: {
              createdAt: 0,
              folder: "",
              path: "atlas.md",
              pinned: false,
              snippet: null,
              tags: [],
              title: "Atlas",
              updatedAt: 0,
            },
          },
        };
      }

      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(() => {
      closeTab(tab);
      clearMocks();
    });

    const bee: NoteMeta = {
      createdAt: new Date(0),
      folder: "",
      path: "bee.md",
      pinned: false,
      snippet: null,
      tags: [],
      title: "Bee",
      updatedAt: new Date(0),
    };

    const palette = mount("actions", []);
    palette.client.setQueryData(
      noteQueries.graph({ kind: "note", path: "atlas.md" }).queryKey,
      {
        mentionsError: { kind: "failed", message: "the disk is busy" },
        picture: {
          dangling: [],
          hubs: [],
          incoming: [
            { lines: [{ at: 4, context: "see Atlas", line: 1 }], note: bee },
          ],
          kind: "note",
          note: { ...bee, path: "atlas.md", title: "Atlas" },
          outgoing: [],
        },
      }
    );

    await palette.user.click(
      screen.getByRole("option", { name: "show links to this note…" })
    );
    await palette.user.click(screen.getByRole("button", { name: "retry" }));

    await waitFor(() => {
      expect(screen.queryByText("the disk is busy")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("option", { name: /Bee/u })).toBeInTheDocument();
  });

  it("should keep the links and toast the reason when a refresh fails", async () => {
    render(<Toaster />);
    openNote("atlas.md");
    const tab = getTabState().activeId;
    registerTabSnapshot(
      tab,
      createStore<TabSnapshot>(() => ({
        pinned: false,
        reason: undefined,
        sourceMode: false,
        status: "saved",
        tags: [],
        title: "Atlas",
      }))
    );
    let reads = 0;
    mockIPC((command) => {
      if (command === "read_graph") {
        reads += 1;

        throw Object.assign(new Error("the disk is busy"), { kind: "failed" });
      }

      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(() => {
      closeTab(tab);
      clearMocks();
    });

    const bee: NoteMeta = {
      createdAt: new Date(0),
      folder: "",
      path: "bee.md",
      pinned: false,
      snippet: null,
      tags: [],
      title: "Bee",
      updatedAt: new Date(0),
    };

    const palette = mount("actions", []);
    palette.client.setQueryData(
      noteQueries.graph({ kind: "note", path: "atlas.md" }).queryKey,
      {
        mentionsError: null,
        picture: {
          dangling: [],
          hubs: [],
          incoming: [
            { lines: [{ at: 4, context: "see Atlas", line: 1 }], note: bee },
          ],
          kind: "note",
          note: { ...bee, path: "atlas.md", title: "Atlas" },
          outgoing: [],
        },
      }
    );

    await palette.user.click(
      screen.getByRole("option", { name: "show links to this note…" })
    );
    await act(async () => {
      await palette.client.invalidateQueries({
        queryKey: noteQueries.graph({ kind: "note", path: "atlas.md" })
          .queryKey,
      });
      // TanStack Query tells its observers on a zero timer, so the failed
      // refresh reaches the view a tick after the refetch settles.
      await sleep(0);
    });

    expect(reads).toBe(1);
    expect(screen.getByRole("option", { name: /Bee/u })).toBeInTheDocument();
    expect(screen.queryByText("could not load links")).not.toBeInTheDocument();
    expect(
      await screen.findByText("could not refresh the links")
    ).toBeInTheDocument();
    expect(screen.getByText("the disk is busy")).toBeInTheDocument();
  });
});

describe("edit tags", () => {
  it("should keep the tags and toast the reason when a refresh fails", async () => {
    render(<Toaster />);
    openNote("atlas.md");
    const tab = getTabState().activeId;
    registerTabSnapshot(
      tab,
      createStore<TabSnapshot>(() => ({
        pinned: false,
        reason: undefined,
        sourceMode: false,
        status: "saved",
        tags: [],
        title: "Atlas",
      }))
    );
    mockIPC((command) => {
      if (command === "list_tags") {
        throw Object.assign(new Error("the disk is busy"), { kind: "failed" });
      }

      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(() => {
      closeTab(tab);
      clearMocks();
    });
    const palette = mount("actions", []);

    await palette.user.click(
      screen.getByRole("option", { name: "edit tags…" })
    );
    await act(async () => {
      await palette.client.invalidateQueries({
        queryKey: noteQueries.tags().queryKey,
      });
      // TanStack Query tells its observers on a zero timer, so the failed
      // refresh reaches the view a tick after the refetch settles.
      await sleep(0);
    });

    expect(screen.getByRole("option", { name: /work/u })).toBeInTheDocument();
    expect(
      screen.queryByText("could not load tag suggestions")
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText("could not refresh the tag list")
    ).toBeInTheDocument();
    expect(screen.getByText("the disk is busy")).toBeInTheDocument();
  });
});
