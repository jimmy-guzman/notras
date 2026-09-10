import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { toast } from "@/components/ui/toast";
import type { Hub, HubPill, Picture, RingMember } from "@/core/graph";
import type { Mention } from "@/core/links";
import type { NoteMeta } from "@/core/notes";
import { noteFolder, noteTitle } from "@/core/notes";
import { noteQueries } from "@/data/queries";
import { getTabState } from "@/lib/tabs/store";
import { NoteGraph, TabGraph } from "./note-graph";

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

function mount(picture: Picture, handlers: Handlers = {}) {
  const { container } = render(
    createElement(NoteGraph, {
      onHop: handlers.onHop ?? (() => undefined),
      onHub: handlers.onHub ?? (() => undefined),
      onLeave: handlers.onLeave ?? (() => undefined),
      onShowMentions: handlers.onShowMentions ?? (() => undefined),
      picture,
    })
  );
  return container;
}

describe("NoteGraph", () => {
  it("should fan what mentions it on the left and what it links to on the right", () => {
    const host = mount(
      notePicture({
        incoming: [mention("a.md"), mention("b.md")],
        outgoing: [mention("d.md")],
      })
    );

    expect(
      Number.parseFloat(screen.getByRole("button", { name: "a" }).style.left)
    ).toBeLessThan(50);
    expect(
      Number.parseFloat(screen.getByRole("button", { name: "b" }).style.left)
    ).toBeLessThan(50);
    expect(
      Number.parseFloat(screen.getByRole("button", { name: "d" }).style.left)
    ).toBeGreaterThan(50);
    expect(screen.getByRole("button", { name: "c" }).style.left).toBe("50%");
    expect(host.textContent).toContain("mentions");
    expect(host.textContent).toContain("links");
  });

  it("should hold the note's folder and tags along the top, each with its count", () => {
    mount(
      notePicture({
        hubs: [folder("work", 3), tag("q3", 7)],
        outgoing: [mention("d.md")],
      })
    );

    const work = screen.getByRole("button", { name: "work 3" });
    const q3 = screen.getByRole("button", { name: "#q3 7" });

    expect(Number.parseFloat(work.style.top)).toBeLessThan(50);
    expect(Number.parseFloat(q3.style.top)).toBeLessThan(50);
    expect(Number.parseFloat(work.style.left)).toBeLessThan(
      Number.parseFloat(q3.style.left)
    );
    expect(work.querySelector("svg")).not.toBeNull();
  });

  it("should land on the centre", () => {
    mount(notePicture({ outgoing: [mention("d.md")] }));

    expect(screen.getByRole("button", { name: "c" })).toHaveFocus();
  });

  it("should walk the ring with the arrow keys, down the right and up the left", async () => {
    const user = userEvent.setup();
    mount(
      notePicture({
        incoming: [mention("a.md"), mention("b.md")],
        outgoing: [mention("d.md"), mention("e.md")],
      })
    );

    act(() => screen.getByRole("button", { name: "c" }).focus());
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "d" })).toHaveFocus();

    act(() => screen.getByRole("button", { name: "d" }).focus());
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "e" })).toHaveFocus();

    act(() => screen.getByRole("button", { name: "e" }).focus());
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "b" })).toHaveFocus();

    act(() => screen.getByRole("button", { name: "b" }).focus());
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: "e" })).toHaveFocus();
  });

  it("should hop on a click, and beside with ⌘", async () => {
    const user = userEvent.setup();
    const onHop = vi.fn();
    mount(notePicture({ outgoing: [mention("d.md")] }), {
      onHop,
    });

    await user.click(screen.getByRole("button", { name: "d" }));
    expect(onHop).toHaveBeenLastCalledWith("d.md", false);

    act(() => screen.getByRole("button", { name: "d" }).focus());
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(onHop).toHaveBeenLastCalledWith("d.md", true);
  });

  it("should re-centre on a hub when one is picked", async () => {
    const user = userEvent.setup();
    const onHub = vi.fn();
    mount(notePicture({ hubs: [tag("q3")] }), { onHub });

    await user.click(screen.getByRole("button", { name: "#q3 2" }));
    expect(onHub).toHaveBeenLastCalledWith({ kind: "tag", tag: "q3" });
  });

  it("should leave on esc, and on the centre", async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    mount(notePicture({ outgoing: [mention("d.md")] }), {
      onLeave,
    });

    act(() => screen.getByRole("button", { name: "d" }).focus());
    await user.keyboard("{Escape}");
    expect(onLeave).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "c" }));
    expect(onLeave).toHaveBeenCalledTimes(2);
  });

  it("should ring a hub with its members and read the hub at the centre", async () => {
    const user = userEvent.setup();
    const onHop = vi.fn();
    const onHub = vi.fn();
    const host = mount(
      hubPicture(folder("work", 3), [
        { kind: "hub", pill: folder("work/sub", 1) },
        { kind: "note", note: meta("work/a.md") },
        { kind: "note", note: meta("work/z.md") },
      ]),
      { onHop, onHub }
    );

    expect(screen.getByRole("button", { name: "work 3" }).style.left).toBe(
      "50%"
    );
    expect(host.textContent).not.toContain("mentions");

    await user.click(screen.getByRole("button", { name: "a" }));
    expect(onHop).toHaveBeenLastCalledWith("work/a.md", false);

    await user.click(screen.getByRole("button", { name: "work/sub 1" }));
    expect(onHub).toHaveBeenLastCalledWith({
      folder: "work/sub",
      kind: "folder",
    });
  });

  it("should draw a link that names no note as a placeholder nothing opens", async () => {
    const user = userEvent.setup();
    const host = mount(
      notePicture({ dangling: ["nowhere"], outgoing: [mention("d.md")] })
    );

    const placeholder = [...host.querySelectorAll("span")].find(
      (span) => span.textContent === "nowhere"
    );

    expect(placeholder?.closest("button")).toBeNull();
    expect(
      screen.getAllByRole("button").map((button) => button.textContent)
    ).toEqual(["c", "d"]);

    // The arrows walk d alone: a placeholder is not on the ring.
    act(() => screen.getByRole("button", { name: "d" }).focus());
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "d" })).toHaveFocus();
  });

  it("should fold a crowded left side into a count that opens the mentions list", async () => {
    const user = userEvent.setup();
    const onShowMentions = vi.fn();
    mount(
      notePicture({
        incoming: Array.from({ length: 14 }, (_, index) =>
          mention(`n${String(index).padStart(2, "0")}.md`)
        ),
      }),
      { onShowMentions }
    );

    expect(screen.getAllByRole("button")).toHaveLength(1 + 11 + 1);
    await user.click(screen.getByRole("button", { name: "+3" }));
    expect(onShowMentions).toHaveBeenCalledTimes(1);
  });

  it("should fold a crowded right side into a count that lists every link", async () => {
    const user = userEvent.setup();
    const before = getTabState().tabs.length;
    mount(
      notePicture({
        outgoing: Array.from({ length: 14 }, (_, index) =>
          mention(`o${String(index).padStart(2, "0")}.md`)
        ),
      })
    );

    await user.click(screen.getByRole("button", { name: "+3" }));

    const rows = screen.getAllByRole("menuitem");

    expect(rows).toHaveLength(14);
    expect(rows[0]?.textContent).toBe("o00see [[c]]");

    await user.click(screen.getByRole("menuitem", { name: "o05 see [[c]]" }));
    expect(getTabState().tabs).toHaveLength(before + 1);
    expect(
      getTabState().tabs.find((tab) => tab.id === getTabState().activeId)?.path
    ).toBe("o05.md");
  });

  it("should count placeholders the cap left out and list them as nothing to open", async () => {
    const user = userEvent.setup();
    mount(
      notePicture({
        dangling: ["x", "y", "z"],
        outgoing: Array.from({ length: 11 }, (_, index) =>
          mention(`o${String(index).padStart(2, "0")}.md`)
        ),
      })
    );

    await user.click(screen.getByRole("button", { name: "+2" }));

    const rows = screen.getAllByRole("menuitem");

    expect(rows).toHaveLength(14);
    expect(rows.slice(11).map((row) => row.textContent)).toEqual([
      "x",
      "y",
      "z",
    ]);
    expect(rows[11]?.getAttribute("aria-disabled")).toBe("true");
  });

  it("should fold a crowded top into a count that lists every hub", async () => {
    const user = userEvent.setup();
    const onHub = vi.fn();
    mount(
      notePicture({
        hubs: Array.from({ length: 7 }, (_, index) => tag(`t${index}`)),
      }),
      { onHub }
    );

    expect(
      screen.getAllByRole("button").map((button) => button.textContent)
    ).toEqual(["c", "#t02", "#t12", "#t22", "#t32", "+3"]);
    await user.click(screen.getByRole("button", { name: "+3" }));

    const rows = screen.getAllByRole("menuitem");

    expect(rows).toHaveLength(7);
    await user.click(screen.getByRole("menuitem", { name: "t6 2" }));
    expect(onHub).toHaveBeenLastCalledWith({ kind: "tag", tag: "t6" });
  });

  it("should stand alone with a line when nothing touches it", () => {
    const host = mount(notePicture());

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(host.textContent).toContain("no links yet, and nothing mentions it");
    expect(host.textContent).not.toContain("links\n");
  });
});

describe("TabGraph native queries", () => {
  it("should keep the previous graph through a hop and show explicit links after a prose failure", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    const response = Promise.withResolvers<unknown>();
    const calls: unknown[] = [];
    mockIPC((command, args) => {
      calls.push({ args, command });
      return response.promise;
    });
    const reported = vi.spyOn(toast, "add");
    const initial = notePicture({ note: meta("first.md") });
    client.setQueryData(
      noteQueries.graph({ kind: "note", path: "first.md" }).queryKey,
      { mentionsError: null, picture: initial }
    );
    onTestFinished(() => {
      client.clear();
      reported.mockRestore();
      clearMocks();
    });
    const { container: host, rerender } = render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(TabGraph, {
          tab: { id: "first", kind: "note", path: "first.md" },
        })
      )
    );
    expect(host.textContent).toContain("first");
    await act(async () => {
      rerender(
        createElement(
          QueryClientProvider,
          { client },
          createElement(TabGraph, {
            tab: { id: "second", kind: "note", path: "second.md" },
          })
        )
      );
      await Promise.resolve();
    });
    expect(host.textContent).toContain("first");
    expect(host.textContent).not.toContain("second");
    await act(async () => {
      response.resolve({
        mentionsError: { kind: "failed", message: "permission denied" },
        picture: {
          graph: {
            dangling: [],
            hubs: [],
            incoming: [],
            outgoing: [
              {
                lines: [
                  { context: "[[Linked]]", line: 2, match: "[[Linked]]" },
                ],
                note: {
                  createdAt: 0,
                  folder: "",
                  path: "linked.md",
                  pinned: false,
                  snippet: null,
                  tags: [],
                  title: "Linked",
                  updatedAt: 1000,
                },
              },
            ],
          },
          kind: "note",
          note: {
            createdAt: 0,
            folder: "",
            path: "second.md",
            pinned: false,
            snippet: null,
            tags: [],
            title: "Second",
            updatedAt: 1000,
          },
        },
      });
      await client.fetchQuery(
        noteQueries.graph({ kind: "note", path: "second.md" })
      );
    });
    await waitFor(() => expect(host).toHaveTextContent("Second"));
    expect(host.textContent).toContain("Linked");
    expect(reported).toHaveBeenCalledExactlyOnceWith({
      description: "permission denied",
      title: "could not read the graph",
      type: "error",
    });
    expect(calls).toEqual([
      {
        args: { target: { kind: "note", path: "second.md" } },
        command: "read_graph",
      },
    ]);
  });
});
