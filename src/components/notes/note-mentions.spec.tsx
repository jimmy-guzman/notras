import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { Mention } from "@/core/links";
import { getTabState } from "@/lib/tabs/store";
import { setMentionsOpen } from "@/lib/ui/mentions";

import { NoteMentions } from "./note-mentions";

// `act` refuses to run without this, and no setup file exists to set it.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let teardown: (() => void) | null = null;

afterEach(() => {
  teardown?.();
  teardown = null;
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

async function mount(mentions: Mention[]) {
  const host = document.createElement("div");

  document.body.append(host);

  const root = createRoot(host);

  await act(async () => {
    root.render(createElement(NoteMentions, { mentions }));
    await Promise.resolve();
  });

  teardown = () => {
    act(() => {
      root.unmount();
    });
    host.remove();
    setMentionsOpen(false);
  };

  return host;
}

async function showList() {
  await act(async () => {
    setMentionsOpen(true);
    await Promise.resolve();
  });

  return [...document.body.querySelectorAll('[role="menuitem"]')];
}

describe("NoteMentions", () => {
  it("should show nothing while nothing links here", async () => {
    const host = await mount([]);

    expect(host.textContent).toBe("");
  });

  it("should count the notes linking here", async () => {
    const host = await mount([
      mention("a.md", "see [[here]]"),
      mention("b.md", "and [[here]]"),
    ]);

    expect(host.textContent).toBe("2 mentions");
  });

  it("should count one note in the singular", async () => {
    const host = await mount([mention("a.md", "see [[here]]")]);

    expect(host.textContent).toBe("1 mention");
  });

  it("should list each linking note with the line that links here", async () => {
    await mount([
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

    await mount([twice, mention("b.md", "once [[here]]")]);

    const items = await showList();

    expect(items.map((item) => item.textContent)).toStrictEqual([
      "a · +1see [[here]]",
      "bonce [[here]]",
    ]);
  });

  it("should start the line a little before its link", async () => {
    const padding = "word ".repeat(20);

    await mount([mention("a.md", `${padding}[[here]] at the end`)]);

    const [item] = await showList();

    expect(item?.textContent).toBe(
      "a…word word word word word word [[here]] at the end"
    );
  });

  it("should close the list when its note goes away", async () => {
    const mentions = [mention("a.md", "see [[here]]")];
    const host = document.createElement("div");

    document.body.append(host);

    const root = createRoot(host);

    await act(async () => {
      root.render(createElement(NoteMentions, { mentions }));
      await Promise.resolve();
    });

    expect(await showList()).toHaveLength(1);

    // Unmount without the teardown's reset, which is what a tab switch or a
    // closed tab does to the component.
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    host.remove();

    await mount(mentions);

    expect(document.body.querySelectorAll('[role="menuitem"]')).toHaveLength(0);
  });

  it("should open the picked note in place, and beside it with ⌘", async () => {
    await mount([
      mention("a.md", "see [[here]]"),
      mention("b.md", "and [[here]]"),
    ]);
    const before = getTabState().tabs.length;

    const [first, second] = await showList();

    await act(async () => {
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(getTabState().tabs).toHaveLength(before + 1);
    expect(
      getTabState().tabs.find((tab) => tab.id === getTabState().activeId)?.path
    ).toBe("a.md");

    const items = await showList();

    await act(async () => {
      (items[1] ?? second)?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, metaKey: true })
      );
      await Promise.resolve();
    });

    expect(getTabState().tabs).toHaveLength(before + 2);
    expect(
      getTabState().tabs.find((tab) => tab.id === getTabState().activeId)?.path
    ).toBe("b.md");
  });
});
