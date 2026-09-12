import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { PaletteSearch } from "@/components/palette-search";
import { Command, CommandList } from "@/components/ui/command";
import type { NoteMeta } from "@/core/notes";
import { parseSearch } from "@/core/search";
import { indexStatusQuery } from "@/data/index-status";
import { noteQueries } from "@/data/queries";

function mount(query: string, error?: Error) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  client.setQueryData(indexStatusQuery.queryKey, { state: "ready" });
  client.setQueryData(noteQueries.list().queryKey, []);
  client.setQueryData(noteQueries.tags().queryKey, []);
  const options = noteQueries.search(parseSearch(query));
  client.setQueryData(options.queryKey, []);
  if (error) {
    client
      .getQueryCache()
      .find({ queryKey: options.queryKey })
      ?.setState({ error, status: "error" });
  }
  onTestFinished(() => client.clear());
  const search = (value: string) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        Command,
        { shouldFilter: false },
        createElement(
          CommandList,
          null,
          createElement(PaletteSearch, {
            onCreate: () => undefined,
            onQueryChange: () => undefined,
            onSelectNote: () => undefined,
            query: value,
          })
        )
      )
    );
  const { container, rerender } = render(search(query));
  return {
    host: container,
    rerender: (value: string) => rerender(search(value)),
  };
}

describe("palette search states", () => {
  it("should request the twenty most recently updated notes while idle", async () => {
    const list = vi.fn((_payload: unknown) => [
      {
        createdAt: 0,
        folder: "",
        path: "recent.md",
        pinned: false,
        snippet: null,
        tags: [],
        title: "Recent",
        updatedAt: 1,
      },
    ]);
    mockIPC((command, payload) => {
      if (command === "list_notes") {
        return list(payload);
      }
      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(clearMocks);
    mount("");

    expect(
      await screen.findByRole("option", { name: "Recent" })
    ).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith({
      filters: {
        folder: null,
        limit: 20,
        pinnedOnly: null,
        query: null,
        sort: "updated",
        tag: null,
      },
    });
  });

  it("should offer creation only for a completed unfiltered empty result", () => {
    const { host, rerender } = mount("budget");
    expect(host.textContent).toContain('create "budget"');
    rerender("other");
    expect(host.textContent).not.toContain("searching notes");
    expect(host.textContent).not.toContain("nothing found");
    expect(host.textContent).not.toContain("create");
  });
  it("should say indexing while a first search waits on the scan", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    client.setQueryData(indexStatusQuery.queryKey, { state: "scanning" });
    client.setQueryData(noteQueries.tags().queryKey, []);
    mockIPC((command) => {
      if (command === "search_notes") {
        return new Promise(() => undefined);
      }
      throw new Error(`unexpected command: ${command}`);
    });
    onTestFinished(() => {
      clearMocks();
      client.clear();
    });
    const { container } = render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          Command,
          { shouldFilter: false },
          createElement(
            CommandList,
            null,
            createElement(PaletteSearch, {
              onCreate: () => undefined,
              onQueryChange: () => undefined,
              onSelectNote: () => undefined,
              query: "budget",
            })
          )
        )
      )
    );

    expect(container.textContent).toContain("indexing notes");
    expect(container.textContent).not.toContain("nothing found");
    expect(container.textContent).not.toContain("create");
    act(() => {
      client.setQueryData(indexStatusQuery.queryKey, { state: "ready" });
    });
    await waitFor(() => {
      expect(container.textContent).not.toContain("indexing notes");
    });
    expect(container.textContent).not.toContain("nothing found");
  });
  it("should show incomplete input without offering creation", () => {
    const { host } = mount("folder:");
    expect(host.textContent).toContain("incomplete filter");
    expect(host.textContent).not.toContain("create");
  });
  it("should show an unresolved filter as empty without offering creation", () => {
    const { host } = mount("folder:missing");
    expect(host.textContent).toContain("nothing found");
    expect(host.textContent).not.toContain("create");
  });
  it("should show the read failure reason without offering creation", () => {
    const { host } = mount("folder:work", new Error("index unavailable"));
    expect(host.textContent).toContain("could not search notes");
    expect(host.textContent).toContain("index unavailable");
    expect(host.textContent).not.toContain("create");
  });
});

it("should start an initial filtered search without unrelated recent rows", () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(noteQueries.tags().queryKey, [{ count: 1, tag: "work" }]);
  client.setQueryData(noteQueries.list().queryKey, [
    {
      createdAt: new Date(0),
      folder: "",
      path: "recent.md",
      pinned: false,
      snippet: null,
      tags: ["work"],
      title: "Recent",
      updatedAt: new Date(0),
    },
  ]);
  const read = Promise.withResolvers<NoteMeta[]>();
  const request = Promise.allSettled([
    client.fetchQuery({
      ...noteQueries.search(parseSearch("#missing")),
      queryFn: () => read.promise,
    }),
  ]);
  onTestFinished(async () => {
    await act(async () => {
      read.resolve([]);
      await request;
    });
    client.clear();
  });
  const { container: host } = render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        Command,
        { shouldFilter: false },
        createElement(
          CommandList,
          null,
          createElement(PaletteSearch, {
            onCreate: () => undefined,
            onQueryChange: () => undefined,
            onSelectNote: () => undefined,
            query: "#missing",
          })
        )
      )
    )
  );
  expect(screen.queryByRole("option")).not.toBeInTheDocument();
  expect(host.textContent).not.toContain("Recent");
  expect(host.textContent).not.toContain("nothing found");
  expect(host.textContent).not.toContain("searching notes");
});
