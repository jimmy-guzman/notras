import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import type { Mention } from "@/core/links";
import { noteQueries } from "@/data/queries";
import { getTabState } from "@/lib/tabs/store";
import { setMentionsOpen } from "@/lib/ui/mentions";

import { MentionsOf, NoteMentions } from "./note-mentions";

afterEach(() => {
  cleanup();
  setMentionsOpen(false);
  clearMocks();
});

function mention(
  path: string,
  context: string,
  target = "here",
  line = 1
): Mention {
  const folder = path.includes("/") ? path.slice(0, path.indexOf("/")) : "";
  const title = path.slice(folder === "" ? 0 : folder.length + 1, -3);

  return {
    lines: [{ context, line, match: `[[${target}]]` }],
    note: {
      createdAt: new Date(0),
      folder,
      path,
      pinned: false,
      snippet: null,
      tags: [],
      title,
      updatedAt: new Date(0),
    },
  };
}

function mount(mentions: Mention[]) {
  const { container } = render(createElement(NoteMentions, { mentions }));
  return container;
}

async function showList() {
  await act(async () => {
    setMentionsOpen(true);
    await Promise.resolve();
  });

  return screen.queryAllByRole("menuitem");
}

describe("NoteMentions", () => {
  it("should show nothing while nothing links here", () => {
    const host = mount([]);

    expect(host.textContent).toBe("");
  });

  it("should count the notes linking here", () => {
    const host = mount([
      mention("a.md", "see [[here]]"),
      mention("b.md", "and [[here]]"),
    ]);

    expect(host.textContent).toBe("2 mentions");
  });

  it("should count one note in the singular", () => {
    const host = mount([mention("a.md", "see [[here]]")]);

    expect(host.textContent).toBe("1 mention");
  });

  it("should list each linking note with the line that links here", async () => {
    mount([
      mention("a.md", "see [[here]] first"),
      mention("work/b.md", "then [[here]]"),
    ]);

    const items = await showList();

    expect(items.map((item) => item.textContent)).toStrictEqual([
      "asee [[here]] first",
      "b · workthen [[here]]",
    ]);
  });

  it("should say when a note links more than once", async () => {
    const twice = mention("a.md", "see [[here]]");

    twice.lines.push({
      context: "and [[here]] again",
      line: 4,
      match: "[[here]]",
    });

    mount([twice, mention("b.md", "once [[here]]")]);

    const items = await showList();

    expect(items.map((item) => item.textContent)).toStrictEqual([
      "a · +1see [[here]]",
      "bonce [[here]]",
    ]);
  });

  it("should start the line a little before its link", async () => {
    const padding = "word ".repeat(20);

    mount([mention("a.md", `${padding}[[here]] at the end`)]);

    const [item] = await showList();

    expect(item?.textContent).toBe(
      "a…word word word word word word [[here]] at the end"
    );
  });

  it("should close the list when its note goes away", async () => {
    const mentions = [mention("a.md", "see [[here]]")];
    const { unmount } = render(createElement(NoteMentions, { mentions }));
    expect(await showList()).toHaveLength(1);
    unmount();
    mount(mentions);

    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });

  it("should open the picked note in place, and beside it with ⌘", async () => {
    mount([mention("a.md", "see [[here]]"), mention("b.md", "and [[here]]")]);
    const user = userEvent.setup();
    const before = getTabState().tabs.length;

    await showList();
    const [first] = screen.getAllByRole("menuitem");
    if (first === undefined) {
      throw new Error("first mention missing");
    }
    await user.click(first);

    expect(getTabState().tabs).toHaveLength(before + 1);
    expect(
      getTabState().tabs.find((tab) => tab.id === getTabState().activeId)?.path
    ).toBe("a.md");

    await showList();
    const [, second] = screen.getAllByRole("menuitem");
    if (second === undefined) {
      throw new Error("second mention missing");
    }
    await user.keyboard("{Meta>}");
    await user.click(second);
    await user.keyboard("{/Meta}");

    expect(getTabState().tabs).toHaveLength(before + 2);
    expect(
      getTabState().tabs.find((tab) => tab.id === getTabState().activeId)?.path
    ).toBe("b.md");
  });
});

describe("MentionsOf native queries", () => {
  it("should publish the complete count together and request only the saved path", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const response = Promise.withResolvers<unknown>();
    const calls: unknown[] = [];
    mockIPC((command, args) => {
      calls.push({ args, command });
      return response.promise;
    });
    const { container: host } = render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(MentionsOf, { path: "atlas.md" })
      )
    );
    onTestFinished(() => client.clear());
    expect(host.textContent).toBe("");
    await act(async () => {
      response.resolve(
        ["a.md", "b.md"].map((path) => ({
          lines: [{ context: "Atlas in prose", line: 2, match: "Atlas" }],
          note: {
            createdAt: 0,
            folder: "",
            path,
            pinned: false,
            snippet: null,
            tags: [],
            title: path,
            updatedAt: 1000,
          },
        }))
      );
      await client.fetchQuery(noteQueries.mentions("atlas.md"));
    });
    await waitFor(() => expect(host.textContent).toBe("2 mentions"));
    expect(calls).toEqual([
      { args: { path: "atlas.md" }, command: "find_mentions" },
    ]);
  });
});
