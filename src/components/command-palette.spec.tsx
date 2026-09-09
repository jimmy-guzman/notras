import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette } from "@/components/command-palette";
import type { NoteMeta } from "@/core/notes";
import { parseSearch } from "@/core/search";
import { noteQueries } from "@/data/queries";
import { getTabState, openNote } from "@/lib/tabs/store";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function press(input: Element, key: string) {
  input.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key })
  );
}

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function mount(mode: "actions" | "find", notes: NoteMeta[]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const closed: boolean[] = [];
  await act(async () => {
    root.render(
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
    await Promise.resolve();
  });
  return {
    client,
    closed,
    get input() {
      const input = document.querySelector<HTMLInputElement>("[cmdk-input]");
      if (input === null) {
        throw new Error("palette input missing");
      }
      return input;
    },
    unmount: () => {
      act(() => root.unmount());
      host.remove();
      client.clear();
    },
  };
}

describe("command palette keyboard", () => {
  it("should open the async search result with Enter rather than inserting a filter", async ({
    onTestFinished,
  }) => {
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
    const palette = await mount("find", []);
    onTestFinished(palette.unmount);
    const read = Promise.withResolvers<NoteMeta[]>();
    const pending = palette.client.fetchQuery({
      ...noteQueries.search(parseSearch("Roadmap")),
      queryFn: () => read.promise,
    });
    act(() => type(palette.input, "Roadmap"));
    await act(async () => {
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain("searching notes")
      );
    });
    act(() => press(palette.input, "Enter"));
    expect(palette.input.value).toBe("Roadmap");
    await act(async () => {
      read.resolve([note]);
      await pending;
    });
    await vi.waitFor(async () => {
      await act(async () => {
        await Promise.resolve();
      });
      expect(
        document.querySelector('[cmdk-item][aria-selected="true"]')?.textContent
      ).toContain("Roadmap");
    });
    act(() => press(palette.input, "Enter"));
    expect(palette.closed).toContain(false);
    expect(getTabState().tabs.some((tab) => tab.path === note.path)).toBe(true);
  });

  it("should keep filter discovery outside result selection and preserve the query through the picker", async ({
    onTestFinished,
  }) => {
    const palette = await mount("find", [
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
    onTestFinished(palette.unmount);
    act(() => type(palette.input, "budget #work "));
    const addFilter = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "add filter"
    );
    expect(addFilter).toBeDefined();
    act(() => addFilter?.click());
    expect(palette.input.value).toBe("");
    act(() => type(palette.input, "folder"));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => press(palette.input, "Enter"));
    expect(palette.input.value).toBe("budget #work folder:");
    expect(document.body.textContent).not.toContain("incomplete filter");
    const folder = [
      ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((row) => row.getAttribute("data-value") === "work");
    expect(folder?.textContent).toContain("1");
    act(() => folder?.click());
    expect(palette.input.value).toBe("budget #work folder:work ");
    expect(document.activeElement).toBe(palette.input);
    act(() => addFilter?.click());
    act(() => press(palette.input, "Escape"));
    expect(palette.input.value).toBe("budget #work folder:work ");
    expect(palette.closed).toEqual([]);
  });

  it("should select the first filter when opening its empty menu and go back from its footer", async ({
    onTestFinished,
  }) => {
    const palette = await mount("find", []);
    onTestFinished(palette.unmount);
    const addFilter = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "add filter"
    );
    act(() => addFilter?.click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      document.querySelector('[role="option"][aria-selected="true"]')
        ?.textContent
    ).toContain("folder");
    const back = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "back to notes"
    );
    await act(async () => {
      back?.focus();
      if (back !== undefined) {
        press(back, "Escape");
      }
      await Promise.resolve();
    });
    expect(palette.input.value).toBe("");
    expect(palette.closed).toEqual([]);
    expect(document.body.textContent).toContain("add filter");
  });

  it("should keep an arrow-key choice when the same query receives updated results", async ({
    onTestFinished,
  }) => {
    const palette = await mount("find", []);
    onTestFinished(palette.unmount);
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
    act(() => type(palette.input, "project"));
    await vi.waitFor(async () => {
      await act(async () => {
        await Promise.resolve();
      });
      expect(
        document.querySelector('[role="option"][aria-selected="true"]')
          ?.textContent
      ).toContain("Project first");
    });
    act(() => press(palette.input, "ArrowDown"));
    expect(
      document.querySelector('[role="option"][aria-selected="true"]')
        ?.textContent
    ).toContain("Project second");
    const read = Promise.withResolvers<NoteMeta[]>();
    const pending = palette.client.fetchQuery({
      ...options,
      queryFn: () => read.promise,
      staleTime: 0,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      document.querySelector('[role="option"][aria-selected="true"]')
        ?.textContent
    ).toContain("Project second");
    await act(async () => {
      read.resolve([second, first]);
      await pending;
    });
    await vi.waitFor(async () => {
      await act(async () => {
        await Promise.resolve();
      });
      expect(
        document.querySelector('[role="option"][aria-selected="true"]')
          ?.textContent
      ).toContain("Project second");
    });
    act(() => press(palette.input, "Enter"));
    expect(palette.closed).toContain(false);
    expect(getTabState().tabs.some((tab) => tab.path === second.path)).toBe(
      true
    );
  });

  it("should select creation after an empty search completes", async ({
    onTestFinished,
  }) => {
    const palette = await mount("find", []);
    onTestFinished(palette.unmount);
    palette.client.setQueryData(
      noteQueries.search(parseSearch("new project")).queryKey,
      []
    );
    act(() => type(palette.input, "new project"));
    expect(document.querySelector('[role="option"]')).toBeNull();
    await vi.waitFor(async () => {
      await act(async () => {
        await Promise.resolve();
      });
      expect(
        document.querySelector('[role="option"][aria-selected="true"]')
          ?.textContent
      ).toContain('create "new project"');
    });
  });

  it("should match visible action wording and select the existing rename title", async ({
    onTestFinished,
  }) => {
    openNote("projects/atlas.md");
    const palette = await mount("actions", [
      {
        createdAt: new Date(0),
        folder: "projects",
        path: "projects/atlas.md",
        pinned: true,
        snippet: null,
        tags: ["work"],
        title: "Atlas",
        updatedAt: new Date(0),
      },
    ]);
    onTestFinished(palette.unmount);
    act(() => type(palette.input, "unpin"));
    expect(document.body.textContent).toContain("unpin note");
    act(() => type(palette.input, "turn on focus"));
    expect(document.body.textContent).toContain("turn on focus mode");
    act(() => type(palette.input, "rename"));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => press(palette.input, "Enter"));
    expect(palette.input.value).toBe("Atlas");
    expect([palette.input.selectionStart, palette.input.selectionEnd]).toEqual([
      0, 5,
    ]);
    act(() => press(palette.input, "Escape"));
    expect(palette.closed).toEqual([]);
    expect(palette.input.value).toBe("");
    expect(document.body.textContent).toContain("rename note");
    const label = document.getElementById(
      palette.input.getAttribute("aria-labelledby") ?? ""
    );
    expect(label?.textContent).toBe("run an action");
  });
});
