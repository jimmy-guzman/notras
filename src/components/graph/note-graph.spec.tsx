import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Hub, HubPill, RingMember } from "@/core/graph";
import type { Mention } from "@/core/links";
import type { NoteMeta } from "@/core/notes";
import { noteFolder, noteTitle } from "@/core/notes";
import { getTabState } from "@/lib/tabs/store";

import type { Picture } from "./note-graph";
import { NoteGraph } from "./note-graph";

// `act` refuses to run without this, and no setup file exists to set it.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// happy-dom lays nothing out, so the stage's size stays zero and the hairlines
// have no length; the pills are what these cases read.
if (typeof ResizeObserver === "undefined") {
  Object.assign(globalThis, {
    ResizeObserver: class {
      disconnect() {
        // Nothing was observed.
      }
      observe() {
        // Nothing lays out, so nothing to report.
      }
    },
  });
}

let teardown: (() => void) | null = null;

afterEach(() => {
  teardown?.();
  teardown = null;
});

function meta(path: string): NoteMeta {
  return {
    createdAt: new Date(0),
    folder: noteFolder(path),
    path,
    pinned: false,
    snippet: null,
    tags: [],
    title: noteTitle(path),
    updatedAt: new Date(0),
  };
}

function mention(path: string): Mention {
  return {
    lines: [{ context: "see [[c]]", line: 1, match: "[[c]]" }],
    note: meta(path),
  };
}

function tag(name: string, count = 2): HubPill {
  return { count, hub: { kind: "tag", tag: name } };
}

function folder(name: string, count = 2): HubPill {
  return { count, hub: { folder: name, kind: "folder" } };
}

function notePicture(
  props: Partial<Extract<Picture, { kind: "note" }>> = {}
): Picture {
  return {
    dangling: [],
    hubs: [],
    incoming: [],
    kind: "note",
    note: meta("c.md"),
    outgoing: [],
    ...props,
  };
}

function hubPicture(hub: HubPill, members: RingMember[]): Picture {
  return { hub, kind: "hub", members };
}

interface Handlers {
  onHop?: (path: string, beside: boolean) => void;
  onHub?: (hub: Hub) => void;
  onLeave?: () => void;
  onShowMentions?: () => void;
}

async function mount(picture: Picture, handlers: Handlers = {}) {
  const host = document.createElement("div");

  document.body.append(host);

  const root = createRoot(host);

  await act(async () => {
    root.render(
      createElement(NoteGraph, {
        onHop: handlers.onHop ?? (() => undefined),
        onHub: handlers.onHub ?? (() => undefined),
        onLeave: handlers.onLeave ?? (() => undefined),
        onShowMentions: handlers.onShowMentions ?? (() => undefined),
        picture,
      })
    );
    await Promise.resolve();
  });

  teardown = () => {
    act(() => {
      root.unmount();
    });
    host.remove();
  };

  return host;
}

function pills(host: HTMLElement) {
  return [...host.querySelectorAll("button")];
}

function pill(host: HTMLElement, text: string) {
  const found = pills(host).find((button) => button.textContent === text);

  if (found === undefined) {
    throw new Error(`no pill reads ${text}`);
  }

  return found;
}

async function press(
  target: Element,
  key: string,
  init: KeyboardEventInit = {}
) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key, ...init })
    );
    await Promise.resolve();
  });
}

async function click(target: Element, init: MouseEventInit = {}) {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
    await Promise.resolve();
  });
}

describe("NoteGraph", () => {
  it("should fan what mentions it on the left and what it links to on the right", async () => {
    const host = await mount(
      notePicture({
        incoming: [mention("a.md"), mention("b.md")],
        outgoing: [mention("d.md")],
      })
    );

    expect(Number.parseFloat(pill(host, "a").style.left)).toBeLessThan(50);
    expect(Number.parseFloat(pill(host, "b").style.left)).toBeLessThan(50);
    expect(Number.parseFloat(pill(host, "d").style.left)).toBeGreaterThan(50);
    expect(pill(host, "c").style.left).toBe("50%");
    expect(host.textContent).toContain("mentions");
    expect(host.textContent).toContain("links");
  });

  it("should hold the note's folder and tags along the top, each with its count", async () => {
    const host = await mount(
      notePicture({
        hubs: [folder("work", 3), tag("q3", 7)],
        outgoing: [mention("d.md")],
      })
    );

    const work = pill(host, "work3");
    const q3 = pill(host, "#q37");

    expect(Number.parseFloat(work.style.top)).toBeLessThan(50);
    expect(Number.parseFloat(q3.style.top)).toBeLessThan(50);
    expect(Number.parseFloat(work.style.left)).toBeLessThan(
      Number.parseFloat(q3.style.left)
    );
    expect(work.querySelector("svg")).not.toBeNull();
  });

  it("should land on the centre", async () => {
    const host = await mount(notePicture({ outgoing: [mention("d.md")] }));

    expect(document.activeElement).toBe(pill(host, "c"));
  });

  it("should walk the ring with the arrow keys, down the right and up the left", async () => {
    const host = await mount(
      notePicture({
        incoming: [mention("a.md"), mention("b.md")],
        outgoing: [mention("d.md"), mention("e.md")],
      })
    );

    await press(pill(host, "c"), "ArrowRight");
    expect(document.activeElement).toBe(pill(host, "d"));

    await press(pill(host, "d"), "ArrowRight");
    expect(document.activeElement).toBe(pill(host, "e"));

    await press(pill(host, "e"), "ArrowRight");
    expect(document.activeElement).toBe(pill(host, "b"));

    await press(pill(host, "b"), "ArrowLeft");
    expect(document.activeElement).toBe(pill(host, "e"));
  });

  it("should hop on a click, and beside with ⌘", async () => {
    const onHop = vi.fn();
    const host = await mount(notePicture({ outgoing: [mention("d.md")] }), {
      onHop,
    });

    await click(pill(host, "d"));
    expect(onHop).toHaveBeenLastCalledWith("d.md", false);

    await press(pill(host, "d"), "Enter", { metaKey: true });
    expect(onHop).toHaveBeenLastCalledWith("d.md", true);
  });

  it("should re-centre on a hub when one is picked", async () => {
    const onHub = vi.fn();
    const host = await mount(notePicture({ hubs: [tag("q3")] }), { onHub });

    await click(pill(host, "#q32"));
    expect(onHub).toHaveBeenLastCalledWith({ kind: "tag", tag: "q3" });
  });

  it("should leave on esc, and on the centre", async () => {
    const onLeave = vi.fn();
    const host = await mount(notePicture({ outgoing: [mention("d.md")] }), {
      onLeave,
    });

    await press(pill(host, "d"), "Escape");
    expect(onLeave).toHaveBeenCalledTimes(1);

    await click(pill(host, "c"));
    expect(onLeave).toHaveBeenCalledTimes(2);
  });

  it("should ring a hub with its members and read the hub at the centre", async () => {
    const onHop = vi.fn();
    const onHub = vi.fn();
    const host = await mount(
      hubPicture(folder("work", 3), [
        { kind: "hub", pill: folder("work/sub", 1) },
        { kind: "note", note: meta("work/a.md") },
        { kind: "note", note: meta("work/z.md") },
      ]),
      { onHop, onHub }
    );

    expect(pill(host, "work3").style.left).toBe("50%");
    expect(host.textContent).not.toContain("mentions");

    await click(pill(host, "a"));
    expect(onHop).toHaveBeenLastCalledWith("work/a.md", false);

    await click(pill(host, "work/sub1"));
    expect(onHub).toHaveBeenLastCalledWith({
      folder: "work/sub",
      kind: "folder",
    });
  });

  it("should draw a link that names no note as a placeholder nothing opens", async () => {
    const host = await mount(
      notePicture({ dangling: ["nowhere"], outgoing: [mention("d.md")] })
    );

    const placeholder = [...host.querySelectorAll("span")].find(
      (span) => span.textContent === "nowhere"
    );

    expect(placeholder?.closest("button")).toBeNull();
    expect(pills(host).map((button) => button.textContent)).toEqual(["c", "d"]);

    // The arrows walk d alone: a placeholder is not on the ring.
    await press(pill(host, "d"), "ArrowRight");
    expect(document.activeElement).toBe(pill(host, "d"));
  });

  it("should fold a crowded left side into a count that opens the mentions list", async () => {
    const onShowMentions = vi.fn();
    const host = await mount(
      notePicture({
        incoming: Array.from({ length: 14 }, (_, index) =>
          mention(`n${String(index).padStart(2, "0")}.md`)
        ),
      }),
      { onShowMentions }
    );

    expect(pills(host)).toHaveLength(1 + 11 + 1);
    await click(pill(host, "+3"));
    expect(onShowMentions).toHaveBeenCalledTimes(1);
  });

  it("should fold a crowded right side into a count that lists every link", async () => {
    const before = getTabState().tabs.length;
    const host = await mount(
      notePicture({
        outgoing: Array.from({ length: 14 }, (_, index) =>
          mention(`o${String(index).padStart(2, "0")}.md`)
        ),
      })
    );

    await click(pill(host, "+3"));

    const rows = [...document.body.querySelectorAll('[role="menuitem"]')];

    expect(rows).toHaveLength(14);
    expect(rows[0]?.textContent).toBe("o00see [[c]]");

    await click(rows[5] ?? rows[0] ?? host);
    expect(getTabState().tabs).toHaveLength(before + 1);
    expect(
      getTabState().tabs.find((tab) => tab.id === getTabState().activeId)?.path
    ).toBe("o05.md");
  });

  it("should count placeholders the cap left out and list them as nothing to open", async () => {
    const host = await mount(
      notePicture({
        dangling: ["x", "y", "z"],
        outgoing: Array.from({ length: 11 }, (_, index) =>
          mention(`o${String(index).padStart(2, "0")}.md`)
        ),
      })
    );

    await click(pill(host, "+2"));

    const rows = [...document.body.querySelectorAll('[role="menuitem"]')];

    expect(rows).toHaveLength(14);
    expect(rows.slice(11).map((row) => row.textContent)).toEqual([
      "x",
      "y",
      "z",
    ]);
    expect(rows[11]?.getAttribute("aria-disabled")).toBe("true");
  });

  it("should fold a crowded top into a count that lists every hub", async () => {
    const onHub = vi.fn();
    const host = await mount(
      notePicture({
        hubs: Array.from({ length: 7 }, (_, index) => tag(`t${index}`)),
      }),
      { onHub }
    );

    expect(pills(host).map((button) => button.textContent)).toEqual([
      "c",
      "#t02",
      "#t12",
      "#t22",
      "#t32",
      "+3",
    ]);
    await click(pill(host, "+3"));

    const rows = [...document.body.querySelectorAll('[role="menuitem"]')];

    expect(rows).toHaveLength(7);
    await click(rows[6] ?? host);
    expect(onHub).toHaveBeenLastCalledWith({ kind: "tag", tag: "t6" });
  });

  it("should stand alone with a line when nothing touches it", async () => {
    const host = await mount(notePicture());

    expect(pills(host)).toHaveLength(1);
    expect(host.textContent).toContain("no links yet, and nothing mentions it");
    expect(host.textContent).not.toContain("links\n");
  });
});
