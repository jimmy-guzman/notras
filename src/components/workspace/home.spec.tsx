import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { Layout } from "@/layout";
import { rememberNote } from "@/lib/recent-notes";
import { closeTab, getTabState, openNote } from "@/lib/tabs/store";

const note = (path: string, title: string, pinned = false) => ({
  createdAt: 1,
  folder: "",
  path,
  pinned,
  snippet: null,
  tags: [],
  title,
  updatedAt: 1,
});

function mountHome(
  notes: ReturnType<typeof note>[],
  indexState: "ready" | "scanning" = "ready",
  failingReads = 0
) {
  localStorage.removeItem("tabs");
  mockWindows("main");
  // The first scan never answers, so the list stays pending.
  const scanning = Promise.withResolvers<never>();
  let reads = 0;
  mockIPC(async (command) => {
    if (command === "get_notes_dir") {
      return "/notes";
    }

    if (command === "index_status") {
      return { state: indexState };
    }

    if (command === "list_notes") {
      reads += 1;

      if (reads <= failingReads) {
        throw Object.assign(new Error("the disk is busy"), { kind: "failed" });
      }

      return indexState === "scanning" ? await scanning.promise : notes;
    }

    if (command === "read_note") {
      return { content: "# Opened\n\nBody", revision: "r1", updatedAt: 1 };
    }

    if (command === "read_conflict") {
      return null;
    }

    if (
      command === "list_tags" ||
      command === "take_pending_open" ||
      command === "find_mentions"
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

  return userEvent.setup();
}

describe("home", () => {
  beforeEach(() => {
    localStorage.removeItem("recent-notes:/notes");
  });

  it("should list the last five visited notes with pinned ones ahead", async () => {
    for (const path of ["f.md", "e.md", "d.md", "c.md", "b.md", "a.md"]) {
      rememberNote("/notes", path);
    }

    mountHome([
      note("a.md", "A"),
      note("b.md", "B"),
      note("c.md", "C"),
      note("d.md", "D"),
      note("e.md", "E"),
      note("f.md", "F", true),
      note("g.md", "G"),
    ]);

    const list = await screen.findByRole("list", { name: "recent notes" });

    expect(
      within(list)
        .getAllByRole("button")
        .map((row) => row.textContent?.at(0))
    ).toStrictEqual(["F", "A", "B", "C", "D"]);
  });

  it("should say why the list could not load and retry", async () => {
    rememberNote("/notes", "a.md");
    const user = mountHome([note("a.md", "A")], "ready", 1);

    const title = await screen.findByText("could not load recent notes");
    const failure = title.closest("[data-slot=empty]");

    if (failure === null || !(failure instanceof HTMLElement)) {
      throw new Error("the failure did not render as an empty state");
    }

    expect(within(failure).getByText("the disk is busy")).toBeInTheDocument();

    await user.click(within(failure).getByRole("button", { name: "retry" }));

    const list = await screen.findByRole("list", { name: "recent notes" });

    expect(within(list).getAllByRole("button")).toHaveLength(1);
  });

  it("should open a recent note on click and on its chord", async () => {
    rememberNote("/notes", "a.md");
    rememberNote("/notes", "b.md");
    // The rows' chords are the tab jumps' chords, held by one owner at a time
    // through both transitions.
    const warn = vi.spyOn(console, "warn");
    onTestFinished(() => {
      warn.mockRestore();
    });
    const user = mountHome([note("a.md", "A"), note("b.md", "B")]);

    const list = await screen.findByRole("list", { name: "recent notes" });
    const [first, second] = within(list).getAllByRole("button");

    if (first === undefined || second === undefined) {
      throw new Error("the recent rows did not render");
    }

    await user.click(second);
    await waitFor(() => {
      expect(getTabState().tabs.map((tab) => tab.path)).toStrictEqual(["a.md"]);
    });
    await screen.findByRole("heading", { name: "Opened" });

    act(() => {
      closeTab(getTabState().activeId);
    });
    await screen.findByRole("list", { name: "recent notes" });

    // The visit put a.md first, so b.md is now the second row.
    await user.keyboard("{Control>}2{/Control}");
    await waitFor(() => {
      expect(getTabState().tabs.map((tab) => tab.path)).toStrictEqual(["b.md"]);
    });
    await screen.findByRole("heading", { name: "Opened" });
    expect(warn).not.toHaveBeenCalled();

    // With a tab open the same chord is the tab jump again.
    const opened = getTabState().activeId;
    act(() => {
      openNote("a.md", true);
    });
    expect(getTabState().activeId).not.toBe(opened);

    await user.keyboard("{Control>}1{/Control}");
    await waitFor(() => {
      expect(getTabState().activeId).toBe(opened);
    });
  });

  it("should show the lockup alone with an empty library", async () => {
    mountHome([]);

    await screen.findByRole("heading", { name: "notras" });
    await screen.findByRole("button", { name: "find a note" });
    expect(
      screen.queryByRole("list", { name: "recent notes" })
    ).not.toBeInTheDocument();
  });

  it("should say indexing while the first scan runs", async () => {
    mountHome([], "scanning");

    expect(await screen.findByText("indexing notes...")).toBeInTheDocument();
  });
});
