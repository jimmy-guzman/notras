import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, onTestFinished } from "vitest";

import { Layout } from "@/layout";
import { readRecentNotes, rememberNote } from "@/lib/recent-notes";
import { closeTab, getTabState } from "@/lib/tabs/store";

const editors = () => document.querySelectorAll(".ProseMirror").length;

const NEW_NOTE = /new note/u;

describe("workspace", () => {
  beforeEach(() => {
    localStorage.removeItem("recent-notes:/notes");
  });

  it.each([
    ["welcome screen", /^search\b/u],
    ["title bar", "find a note"],
  ])("should open note search from the %s", async (_surface, name) => {
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

    await user.click(await screen.findByRole("button", { name }));

    expect(
      await screen.findByRole("combobox", { name: "find a note" })
    ).toBeInTheDocument();
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
    await screen.findByText("loading recent note...");
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
});

describe("launch note", () => {
  it.each([true, false])(
    "should open the last surviving choice or fall back to last saved, with history %s",
    async (withHistory) => {
      for (const tab of getTabState().tabs) {
        closeTab(tab.id);
      }
      localStorage.clear();
      if (withHistory) {
        rememberNote("/notes", "chosen.md");
        rememberNote("/notes", "missing.md");
      }
      mockWindows("main");
      mockIPC((command) => {
        if (command === "get_notes_dir") {
          return "/notes";
        }
        if (command === "list_notes") {
          return [
            {
              createdAt: 0,
              folder: "",
              path: "pin.md",
              pinned: true,
              snippet: null,
              tags: [],
              title: "Pin",
              updatedAt: 1,
            },
            {
              createdAt: 0,
              folder: "",
              path: "newest.md",
              pinned: false,
              snippet: null,
              tags: [],
              title: "Newest",
              updatedAt: 100,
            },
            {
              createdAt: 0,
              folder: "",
              path: "chosen.md",
              pinned: false,
              snippet: null,
              tags: [],
              title: "Chosen",
              updatedAt: 0,
            },
          ];
        }
        if (command === "index_status") {
          return { state: "ready" };
        }
        if (command === "read_note") {
          return { content: "# Opened", revision: "r1", updatedAt: 1 };
        }
        if (command === "read_conflict") {
          return null;
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
        localStorage.clear();
      });
      render(
        <QueryClientProvider client={client}>
          <Layout />
        </QueryClientProvider>
      );
      await screen.findByRole("heading", { name: "Opened" });
      expect(getTabState().tabs.map((tab) => tab.path)).toStrictEqual([
        withHistory ? "chosen.md" : "newest.md",
      ]);
      expect(readRecentNotes("/notes")).toStrictEqual(
        withHistory ? ["missing.md", "chosen.md"] : []
      );
    }
  );
});
