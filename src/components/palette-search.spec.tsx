import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Command, CommandList } from "@/components/ui/command";
import type { NoteMeta } from "@/core/notes";
import { parseSearch } from "@/core/search";
import { noteQueries } from "@/data/queries";
import { PaletteSearch } from "./palette-search";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let teardown: (() => void) | undefined;
afterEach(() => {
  teardown?.();
  teardown = undefined;
});

async function mount(query: string, error?: Error) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  const options = noteQueries.search(parseSearch(query));
  client.setQueryData(options.queryKey, []);
  if (error) {
    client
      .getQueryCache()
      .find({ queryKey: options.queryKey })
      ?.setState({ error, status: "error" });
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async (value: string) => {
    await act(async () => {
      root.render(
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
                allTags: [],
                notes: [],
                onCreate: () => undefined,
                onQueryChange: () => undefined,
                onSelectNote: () => undefined,
                query: value,
              })
            )
          )
        )
      );
      await Promise.resolve();
    });
  };
  teardown = () => {
    act(() => root.unmount());
    host.remove();
    client.clear();
  };
  await render(query);
  return { host, render };
}

describe("palette search states", () => {
  it("should offer creation only for a completed unfiltered empty result", async () => {
    const { host, render } = await mount("budget");
    expect(host.textContent).toContain('create "budget"');
    await render("other");
    expect(host.textContent).not.toContain("searching notes");
    expect(host.textContent).not.toContain("nothing found");
    expect(host.textContent).not.toContain("create");
  });
  it("should show incomplete input without offering creation", async () => {
    const { host } = await mount("folder:");
    expect(host.textContent).toContain("incomplete filter");
    expect(host.textContent).not.toContain("create");
  });
  it("should show an unresolved filter as empty without offering creation", async () => {
    const { host } = await mount("folder:missing");
    expect(host.textContent).toContain("nothing found");
    expect(host.textContent).not.toContain("create");
  });
  it("should show the read failure reason without offering creation", async () => {
    const { host } = await mount("folder:work", new Error("index unavailable"));
    expect(host.textContent).toContain("could not search notes");
    expect(host.textContent).toContain("index unavailable");
    expect(host.textContent).not.toContain("create");
  });
});

it("should start an initial filtered search without unrelated recent rows", async ({
  onTestFinished,
}) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const read = Promise.withResolvers<NoteMeta[]>();
  const request = Promise.allSettled([
    client.fetchQuery({
      ...noteQueries.search(parseSearch("#missing")),
      queryFn: () => read.promise,
    }),
  ]);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  onTestFinished(async () => {
    await act(async () => {
      read.resolve([]);
      await request;
      root.unmount();
    });
    host.remove();
    client.clear();
  });
  await act(async () => {
    root.render(
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
              allTags: [{ count: 1, tag: "work" }],
              notes: [
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
              ],
              onCreate: () => undefined,
              onQueryChange: () => undefined,
              onSelectNote: () => undefined,
              query: "#missing",
            })
          )
        )
      )
    );
    await Promise.resolve();
  });
  expect(host.querySelector('[role="option"]')).toBeNull();
  expect(host.textContent).not.toContain("Recent");
  expect(host.textContent).not.toContain("nothing found");
  expect(host.textContent).not.toContain("searching notes");
});
