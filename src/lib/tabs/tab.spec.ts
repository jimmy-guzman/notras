import { describe, expect, it } from "vitest";

import type { TabState } from "./tab";

import {
  adoptNote,
  closeTab,
  moveTabTo,
  openTab,
  openTabAt,
  parseTabs,
  pushClosed,
  replaceNotePath,
  serializeTabs,
  stepTab,
  tabButtonId,
  tabPanelId,
} from "./tab";

const WHITESPACE = /\s/;

/** Ids are opaque (`D56`), so the specs use a readable one per path. */
const note = (path: string) =>
  ({ id: `id-${path}`, kind: "note", path }) as const;

const external = (path: string) =>
  ({ id: `id-external-${path}`, kind: "external", path }) as const;

/** a.md, b.md, c.md open with b.md showing. */
const three: TabState = {
  activeId: "id-b.md",
  tabs: [note("a.md"), note("b.md"), note("c.md")],
};

describe("tabButtonId and tabPanelId", () => {
  it("should give a tab and its panel ids an aria reference can resolve", () => {
    // Both are read from `aria-controls` and `aria-labelledby`, which are
    // space-separated ID lists: whitespace in an id splits the reference and
    // the pairing breaks. Ids are minted in `store.ts` (`D56`).
    const id = crypto.randomUUID();

    expect(tabButtonId(id)).not.toMatch(WHITESPACE);
    expect(tabPanelId(id)).not.toMatch(WHITESPACE);
    expect(tabButtonId(id)).not.toBe(tabPanelId(id));
  });
});

describe("openTab", () => {
  it("should replace the active tab by default", () => {
    const next = openTab(three, note("d.md"));

    expect(next.tabs.map((tab) => tab.path)).toStrictEqual([
      "a.md",
      "d.md",
      "c.md",
    ]);
    expect(next.activeId).toBe("id-d.md");
  });

  it("should insert after the active tab when opening in a new tab", () => {
    const next = openTab(three, note("d.md"), true);

    expect(next.tabs.map((tab) => tab.path)).toStrictEqual([
      "a.md",
      "b.md",
      "d.md",
      "c.md",
    ]);
    expect(next.activeId).toBe("id-d.md");
  });

  it("should focus an already-open tab instead of duplicating it", () => {
    const next = openTab(three, note("c.md"), true);

    expect(next.tabs).toStrictEqual(three.tabs);
    expect(next.activeId).toBe("id-c.md");
  });

  it("should open into an empty set", () => {
    const next = openTab({ activeId: "", tabs: [] }, note("a.md"));

    expect(next.tabs.map((tab) => tab.path)).toStrictEqual(["a.md"]);
    expect(next.activeId).toBe("id-a.md");
  });

  it("should open an external file alongside a note", () => {
    const next = openTab(
      { activeId: "id-a.md", tabs: [note("a.md")] },
      external("/tmp/notes.md"),
      true
    );

    expect(next.tabs).toHaveLength(2);
    expect(next.activeId).toBe(external("/tmp/notes.md").id);
  });
});

describe("closeTab", () => {
  it("should hand focus to the tab on the right", () => {
    const next = closeTab(three, "id-b.md");

    expect(next.tabs.map((tab) => tab.path)).toStrictEqual(["a.md", "c.md"]);
    expect(next.activeId).toBe("id-c.md");
  });

  it("should hand focus leftwards when closing the last tab", () => {
    const next = closeTab({ activeId: "id-c.md", tabs: three.tabs }, "id-c.md");

    expect(next.activeId).toBe("id-b.md");
  });

  it("should leave the active tab alone when closing another", () => {
    const next = closeTab(three, "id-a.md");

    expect(next.activeId).toBe("id-b.md");
  });

  it("should leave no active tab when the set empties", () => {
    const next = closeTab(
      { activeId: "id-a.md", tabs: [note("a.md")] },
      "id-a.md"
    );

    expect(next.tabs).toStrictEqual([]);
    expect(next.activeId).toBe("");
  });

  it("should ignore a tab that is not open", () => {
    expect(closeTab(three, "id-z.md")).toStrictEqual(three);
  });
});

describe("replaceNotePath", () => {
  it("should move the tab to the new path in place", () => {
    const next = replaceNotePath(three, "b.md", "work/b.md");

    expect(next.tabs.map((tab) => tab.path)).toStrictEqual([
      "a.md",
      "work/b.md",
      "c.md",
    ]);
  });

  it("should keep the moved tab's id, so its editing session survives", () => {
    // The workspace keys each `NoteSession` by this id. Deriving it from the
    // path remounted the editor on every rename, losing undo history, the
    // caret and the scroll position (`D56`).
    const next = replaceNotePath(three, "b.md", "work/b.md");

    expect(next.tabs[1]?.id).toBe(note("b.md").id);
    expect(next.activeId).toBe(note("b.md").id);
  });

  it("should leave the set alone when the path did not change", () => {
    expect(replaceNotePath(three, "b.md", "b.md")).toStrictEqual(three);
  });

  it("should keep the active tab when a background tab moves", () => {
    const next = replaceNotePath(three, "a.md", "work/a.md");

    expect(next.activeId).toBe("id-b.md");
  });

  it("should collapse onto a path that is already open", () => {
    const next = replaceNotePath(three, "b.md", "c.md");

    expect(next.tabs.map((tab) => tab.path)).toStrictEqual(["a.md", "c.md"]);
    expect(next.activeId).toBe("id-c.md");
  });

  it("should ignore a path that is not open", () => {
    expect(replaceNotePath(three, "z.md", "y.md")).toStrictEqual(three);
  });
});

describe("adoptNote", () => {
  it("should turn the external tab into the note, keeping its id", () => {
    const state: TabState = {
      activeId: "id-external-/vault/b.md",
      tabs: [note("a.md"), external("/vault/b.md")],
    };

    const next = adoptNote(state, "id-external-/vault/b.md", "b.md");

    expect(next.tabs).toStrictEqual([
      note("a.md"),
      { id: "id-external-/vault/b.md", kind: "note", path: "b.md" },
    ]);
    expect(next.activeId).toBe("id-external-/vault/b.md");
  });

  it("should collapse onto the note when it is already open", () => {
    const state: TabState = {
      activeId: "id-external-/vault/a.md",
      tabs: [note("a.md"), external("/vault/a.md")],
    };

    const next = adoptNote(state, "id-external-/vault/a.md", "a.md");

    expect(next.tabs).toStrictEqual([note("a.md")]);
    expect(next.activeId).toBe("id-a.md");
  });

  it("should ignore an id that is not open", () => {
    expect(adoptNote(three, "id-missing", "z.md")).toStrictEqual(three);
  });
});

describe("stepTab", () => {
  it("should move to the next tab", () => {
    expect(stepTab(three, "next")?.path).toBe("c.md");
  });

  it("should move to the previous tab", () => {
    expect(stepTab(three, "previous")?.path).toBe("a.md");
  });

  it("should wrap past the last tab to the first", () => {
    expect(
      stepTab({ activeId: "id-c.md", tabs: three.tabs }, "next")?.path
    ).toBe("a.md");
  });

  it("should wrap before the first tab to the last", () => {
    expect(
      stepTab({ activeId: "id-a.md", tabs: three.tabs }, "previous")?.path
    ).toBe("c.md");
  });

  it("should jump to the first and last tabs", () => {
    expect(stepTab(three, "start")?.path).toBe("a.md");
    expect(stepTab(three, "end")?.path).toBe("c.md");
  });

  it("should land on nothing when no tabs are open", () => {
    expect(stepTab({ activeId: "", tabs: [] }, "next")).toBeUndefined();
  });
});

describe("moveTabTo", () => {
  it("should move a tab later in the strip", () => {
    expect(
      moveTabTo(three, "id-a.md", 2).tabs.map((tab) => tab.path)
    ).toStrictEqual(["b.md", "c.md", "a.md"]);
  });

  it("should move a tab earlier in the strip", () => {
    expect(
      moveTabTo(three, "id-c.md", 0).tabs.map((tab) => tab.path)
    ).toStrictEqual(["c.md", "a.md", "b.md"]);
  });

  it("should clamp past either end", () => {
    expect(
      moveTabTo(three, "id-b.md", 99).tabs.map((tab) => tab.path)
    ).toStrictEqual(["a.md", "c.md", "b.md"]);
    expect(
      moveTabTo(three, "id-b.md", -5).tabs.map((tab) => tab.path)
    ).toStrictEqual(["b.md", "a.md", "c.md"]);
  });

  it("should keep the active tab through a reorder", () => {
    expect(moveTabTo(three, "id-a.md", 2).activeId).toBe("id-b.md");
  });

  it("should ignore a tab that is not open", () => {
    expect(moveTabTo(three, "id-z.md", 0)).toStrictEqual(three);
  });
});

describe("pushClosed", () => {
  it("should put the most recent first", () => {
    const closed = pushClosed(pushClosed([], note("a.md"), 0), note("b.md"), 1);

    expect(closed.map((entry) => entry.tab.path)).toStrictEqual([
      "b.md",
      "a.md",
    ]);
  });

  it("should keep the slot each tab was closed from", () => {
    const closed = pushClosed(pushClosed([], note("a.md"), 0), note("c.md"), 2);

    expect(closed.map((entry) => entry.index)).toStrictEqual([2, 0]);
  });

  it("should move a repeat to the top instead of duplicating it", () => {
    const closed = pushClosed(
      pushClosed(pushClosed([], note("a.md"), 0), note("b.md"), 1),
      note("a.md"),
      3
    );

    expect(closed.map((entry) => entry.tab.path)).toStrictEqual([
      "a.md",
      "b.md",
    ]);
    expect(closed[0]?.index).toBe(3);
  });

  it("should bound the stack at ten", () => {
    const closed = Array.from({ length: 14 }).reduce<
      ReturnType<typeof pushClosed>
    >((stack, _, index) => pushClosed(stack, note(`${index}.md`), index), []);

    expect(closed).toHaveLength(10);
    expect(closed[0]?.tab.path).toBe("13.md");
  });
});

describe("reopening a batch", () => {
  /**
   * `closeOtherTabs` and `closeTabsAfter` push rightmost-first, so the leftmost
   * sits on top and each reopen lands in a strip that has regrown under it.
   */
  it("should rebuild the strip in order when a batch is reopened", () => {
    const tabs = [note("a.md"), note("b.md"), note("c.md"), note("d.md")];
    const closedRightmostFirst = [3, 2, 1].reduce<
      ReturnType<typeof pushClosed>
    >((stack, index) => {
      const tab = tabs[index];

      return tab === undefined ? stack : pushClosed(stack, tab, index);
    }, []);

    const rebuilt = closedRightmostFirst.reduce<TabState>(
      (state, entry) => openTabAt(state, entry.tab, entry.index),
      { activeId: "id-a.md", tabs: [note("a.md")] }
    );

    expect(rebuilt.tabs.map((tab) => tab.path)).toStrictEqual([
      "a.md",
      "b.md",
      "c.md",
      "d.md",
    ]);
  });
});

describe("openTabAt", () => {
  it("should put a tab back in the slot it came out of", () => {
    const closedAt = 1;
    const without = closeTab(three, "id-b.md");
    const next = openTabAt(without, note("b.md"), closedAt);

    expect(next.tabs.map((tab) => tab.path)).toStrictEqual([
      "a.md",
      "b.md",
      "c.md",
    ]);
    expect(next.activeId).toBe("id-b.md");
  });

  it("should clamp to the end when the strip has since shrunk", () => {
    const next = openTabAt(
      { activeId: "id-a.md", tabs: [note("a.md")] },
      note("z.md"),
      7
    );

    expect(next.tabs.map((tab) => tab.path)).toStrictEqual(["a.md", "z.md"]);
  });

  it("should focus a tab that is somehow already open", () => {
    const next = openTabAt(three, note("c.md"), 0);

    expect(next.tabs).toStrictEqual(three.tabs);
    expect(next.activeId).toBe("id-c.md");
  });
});

describe("parseTabs", () => {
  it("should reject a set holding one id twice", () => {
    const raw = JSON.stringify({
      activeId: "same",
      carets: {},
      tabs: [
        { id: "same", kind: "note", path: "a.md" },
        { id: "same", kind: "note", path: "b.md" },
      ],
    });

    expect(parseTabs(raw)).toBeUndefined();
  });

  it("should reject a set holding one file twice", () => {
    const raw = JSON.stringify({
      activeId: "first",
      carets: {},
      tabs: [
        { id: "first", kind: "note", path: "a.md" },
        { id: "second", kind: "note", path: "a.md" },
      ],
    });

    expect(parseTabs(raw)).toBeUndefined();
  });

  it("should reject a set written without ids holding one file twice", () => {
    const raw = JSON.stringify({
      activeId: "note:a.md",
      carets: {},
      tabs: [
        { kind: "note", path: "a.md" },
        { kind: "note", path: "a.md" },
      ],
    });

    expect(parseTabs(raw)).toBeUndefined();
  });

  it("should keep a note and an external file at the same path apart", () => {
    const raw = JSON.stringify({
      activeId: "n",
      carets: {},
      tabs: [
        { id: "n", kind: "note", path: "a.md" },
        { id: "x", kind: "external", path: "a.md" },
      ],
    });

    expect(parseTabs(raw)?.tabs).toHaveLength(2);
  });

  it("should round-trip what serializeTabs wrote", () => {
    const value = {
      activeId: "id-b.md",
      carets: { "id-b.md": 42 },
      tabs: [note("a.md"), external("/tmp/x.md")],
    };

    expect(parseTabs(serializeTabs(value))).toStrictEqual(value);
  });

  it("should reject text that is not json", () => {
    expect(parseTabs("{oops")).toBeUndefined();
  });

  it("should reject a set with a malformed tab", () => {
    expect(
      parseTabs('{"activeId":"id-a.md","tabs":[{"kind":"folder","path":"a"}]}')
    ).toBeUndefined();
  });

  it("should reject a missing tab list", () => {
    expect(parseTabs('{"activeId":"id-a.md"}')).toBeUndefined();
  });

  it("should drop caret offsets that are not numbers", () => {
    const parsed = parseTabs(
      '{"activeId":"","tabs":[],"carets":{"a":"nope","b":7}}'
    );

    expect(parsed?.carets).toStrictEqual({ b: 7 });
  });
});
