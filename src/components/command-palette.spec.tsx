import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createStore } from "@tanstack/react-store";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { CommandPalette } from "@/components/command-palette";
import type { NoteMeta } from "@/core/notes";
import { parseSearch } from "@/core/search";
import { noteQueries } from "@/data/queries";
import { getTabState, openNote, registerTabSnapshot } from "@/lib/tabs/store";

function mount(mode: "actions" | "find", notes: NoteMeta[]) {
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  const closed: boolean[] = [];
  onTestFinished(() => client.clear());
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(CommandPalette, {
        allTags: [{ count: 1, tag: "work" }],
        mode,
        notes,
        notesDir: "/notes",
        onOpenChange: (next) => closed.push(next),
        onOpenSettings: () => undefined,
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
      palette.client.fetchQuery({
        ...noteQueries.search(parseSearch("Roadmap")),
        queryFn: () => read.promise,
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
    expect(getTabState().tabs.some((tab) => tab.path === note.path)).toBe(true);
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
    expect(palette.closed).toEqual([]);
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
    act(() => back.focus());
    await palette.user.keyboard("{Escape}");
    expect(palette.input.value).toBe("");
    expect(palette.closed).toEqual([]);
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
      palette.client.fetchQuery({
        ...options,
        queryFn: () => read.promise,
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
    expect(getTabState().tabs.some((tab) => tab.path === second.path)).toBe(
      true
    );
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
    expect([palette.input.selectionStart, palette.input.selectionEnd]).toEqual([
      0, 5,
    ]);
    await palette.user.keyboard("{Escape}");
    expect(palette.closed).toEqual([]);
    expect(palette.input.value).toBe("");
    expect(document.body.textContent).toContain("rename note");
    const label = document.getElementById(
      palette.input.getAttribute("aria-labelledby") ?? ""
    );
    expect(label?.textContent).toBe("run an action");
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
      palette.client.fetchQuery({
        ...noteQueries.search(parseSearch("found")),
        queryFn: () => read.promise,
      }),
    ]);
    const row = screen.getByRole("option");
    fireEvent.change(palette.input, { target: { value: "found" } });
    expect(document.querySelector('[role="option"]')).toBe(row);
    expect(row?.textContent).toContain("Recent");
    expect(row?.getAttribute("aria-disabled")).toBe("true");
    expect(document.body.textContent).not.toContain("searching notes");
    fireEvent.click(row);
    act(() => palette.input.focus());
    fireEvent.keyDown(palette.input, { key: "Enter" });
    fireEvent.keyDown(palette.input, { key: "Enter", metaKey: true });
    expect(palette.closed).toEqual([]);
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
    expect(palette.closed).toEqual([]);
    fireEvent.keyDown(palette.input, { key: "Enter" });
    expect(palette.closed).toEqual([false]);
    expect(getTabState().tabs.some((tab) => tab.path === "found.md")).toBe(
      true
    );
  });

  it("should delay the footer spinner until a read takes 500ms and reset it for another query", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const palette = mount("find", []);
    const read = Promise.withResolvers<NoteMeta[]>();
    const request = Promise.allSettled([
      palette.client.fetchQuery({
        ...noteQueries.search(parseSearch("slow")),
        queryFn: () => read.promise,
      }),
    ]);
    fireEvent.change(palette.input, { target: { value: "slow" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(149);
    });
    expect(
      document.querySelector('svg[aria-label="searching notes"]')
    ).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(
      document.querySelector('svg[aria-label="searching notes"]')
    ).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(
      document.querySelector('svg[aria-label="searching notes"]')
    ).not.toBeNull();
    expect(
      document.querySelector('[cmdk-list] svg[aria-label="searching notes"]')
    ).toBeNull();
    expect(document.body.textContent).not.toContain("searching notes");
    palette.client.setQueryData(
      noteQueries.search(parseSearch("cached")).queryKey,
      []
    );
    fireEvent.change(palette.input, { target: { value: "cached" } });
    expect(
      document.querySelector('svg[aria-label="searching notes"]')
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
      document.querySelector('svg[aria-label="searching notes"]')
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
      palette.client.fetchQuery({
        ...noteQueries.search(parseSearch("first")),
        queryFn: () => firstRead.promise,
      }),
    ]);
    const lastRead = Promise.withResolvers<NoteMeta[]>();
    const lastRequest = Promise.allSettled([
      palette.client.fetchQuery({
        ...noteQueries.search(parseSearch("last")),
        queryFn: () => lastRead.promise,
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
      document.querySelector('svg[aria-label="searching notes"]')
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
