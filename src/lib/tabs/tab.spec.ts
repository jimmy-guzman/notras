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
  tabFullPath,
  tabPanelId,
} from "./tab";

const WHITESPACE = /\s/u;

/** Ids are opaque (`D56`), so the specs use a readable one per path. */
const note = (path: string) =>
  ({ id: `id-${path}`, kind: "note", path }) as const;

const external = (path: string) =>
  ({ id: `id-external-${path}`, kind: "external", path }) as const;

const draft = (id: string) => ({ id, kind: "draft", path: "" }) as const;

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

describe(tabFullPath, () => {
  it("should put the notes dir in front of a note's path", () => {
    expect(
      tabFullPath({ id: "t1", kind: "note", path: "a.md" }, "/Users/me/notras")
    ).toBe("/Users/me/notras/a.md");
  });

  it("should keep a note's folder between the notes dir and the file", () => {
    expect(
      tabFullPath(
        { id: "t1", kind: "note", path: "work/q3.md" },
        "/Users/me/notras"
      )
    ).toBe("/Users/me/notras/work/q3.md");
  });

  it("should hand back an external file's own path untouched", () => {
    expect(
      tabFullPath(
        { id: "t1", kind: "external", path: "/tmp/notes/scratch.md" },
        "/Users/me/notras"
      )
    ).toBe("/tmp/notes/scratch.md");
  });
});

describe(openTab, () => {
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

  it("should record the showing tab as the opener when opening beside it", () => {
    const next = openTab(three, note("d.md"), true);

    expect(next.tabs[2]).toStrictEqual({ ...note("d.md"), opener: "id-b.md" });
  });

  it("should hand the replaced tab's opener to its replacement", () => {
    const opened = openTab(three, note("d.md"), true);
    const next = openTab(opened, note("e.md"));

    expect(next.tabs[2]).toStrictEqual({ ...note("e.md"), opener: "id-b.md" });
  });

  it("should record no opener when replacing a tab that has none", () => {
    const next = openTab(three, note("d.md"));

    expect(next.tabs[1]?.opener).toBeUndefined();
  });

  it("should open into an empty set", () => {
    const next = openTab({ activeId: "", tabs: [] }, note("a.md"));

    expect(next.tabs.map((tab) => tab.path)).toStrictEqual(["a.md"]);
    expect(next.activeId).toBe("id-a.md");
  });

  it("should open a second draft beside the first instead of focusing it", () => {
    const one = openTab(three, draft("draft-1"), true);
    const next = openTab(one, draft("draft-2"), true);

    expect(next.tabs.map((tab) => tab.id)).toStrictEqual([
      "id-a.md",
      "id-b.md",
      "draft-1",
      "draft-2",
      "id-c.md",
    ]);
    expect(next.activeId).toBe("draft-2");
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

describe(closeTab, () => {
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

  it("should return to the tab that opened the one closing", () => {
    // Opened beside a.md, so it sits between a.md and b.md. The right-hand
    // rule would land on b.md; the opener rule lands back on a.md.
    const opened = openTab(
      { activeId: "id-a.md", tabs: three.tabs },
      note("d.md"),
      true
    );

    const next = closeTab(opened, "id-d.md");

    expect(next.activeId).toBe("id-a.md");
  });

  it("should fall back to the right-hand rule when the opener is gone", () => {
    const opened = openTab(
      { activeId: "id-a.md", tabs: three.tabs },
      note("d.md"),
      true
    );
    const withoutOpener = closeTab(opened, "id-a.md");

    const next = closeTab(withoutOpener, "id-d.md");

    expect(next.activeId).toBe("id-b.md");
  });

  it("should return to the opener after the tab was dragged elsewhere", () => {
    const opened = openTab(
      { activeId: "id-a.md", tabs: three.tabs },
      note("d.md"),
      true
    );
    const dragged = moveTabTo(opened, "id-d.md", 3);

    const next = closeTab(dragged, "id-d.md");

    expect(next.activeId).toBe("id-a.md");
  });

  it("should leave the opener out of it when closing a background tab", () => {
    const opened = openTab(
      { activeId: "id-a.md", tabs: three.tabs },
      note("d.md"),
      true
    );

    const next = closeTab({ ...opened, activeId: "id-c.md" }, "id-d.md");

    expect(next.activeId).toBe("id-c.md");
  });
});

describe(replaceNotePath, () => {
  it("should move the tab to the new path in place", () => {
    const next = replaceNotePath(three, "id-b.md", "work/b.md");

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
    const next = replaceNotePath(three, "id-b.md", "work/b.md");

    expect(next.tabs[1]?.id).toBe(note("b.md").id);
    expect(next.activeId).toBe(note("b.md").id);
  });

  it("should leave the set alone when the path did not change", () => {
    expect(replaceNotePath(three, "id-b.md", "b.md")).toStrictEqual(three);
  });

  it("should keep the active tab when a background tab moves", () => {
    const next = replaceNotePath(three, "id-a.md", "work/a.md");

    expect(next.activeId).toBe("id-b.md");
  });

  it("should collapse onto a path that is already open", () => {
    const next = replaceNotePath(three, "id-b.md", "c.md");

    expect(next.tabs.map((tab) => tab.path)).toStrictEqual(["a.md", "c.md"]);
    expect(next.activeId).toBe("id-c.md");
  });

  it("should ignore a tab that is not open", () => {
    expect(replaceNotePath(three, "id-z.md", "y.md")).toStrictEqual(three);
  });

  it("should turn a draft into the note its first save created", () => {
    const state: TabState = {
      activeId: "draft-1",
      tabs: [note("a.md"), draft("draft-1")],
    };

    const next = replaceNotePath(state, "draft-1", "hello.md");

    expect(next.tabs[1]).toStrictEqual({
      id: "draft-1",
      kind: "note",
      path: "hello.md",
    });
    expect(next.activeId).toBe("draft-1");
  });

  it("should leave a sibling draft alone when one gets its file", () => {
    const state: TabState = {
      activeId: "draft-2",
      tabs: [draft("draft-1"), draft("draft-2")],
    };

    const next = replaceNotePath(state, "draft-2", "hello.md");

    expect(next.tabs.map((tab) => tab.kind)).toStrictEqual(["draft", "note"]);
  });

  it("should keep an external file external when its title renames it", () => {
    const state: TabState = {
      activeId: "id-external-/tmp/a.md",
      tabs: [external("/tmp/a.md")],
    };

    const next = replaceNotePath(state, "id-external-/tmp/a.md", "/tmp/b.md");

    expect(next.tabs[0]).toStrictEqual({
      id: "id-external-/tmp/a.md",
      kind: "external",
      path: "/tmp/b.md",
    });
  });
});

describe(adoptNote, () => {
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

describe(stepTab, () => {
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

describe(moveTabTo, () => {
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

describe(pushClosed, () => {
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
    let closed: ReturnType<typeof pushClosed> = [];
    for (let index = 0; index < 14; index += 1) {
      closed = pushClosed(closed, note(`${index}.md`), index);
    }

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
    let closedRightmostFirst: ReturnType<typeof pushClosed> = [];
    for (const index of [3, 2, 1]) {
      const tab = tabs[index];
      if (tab !== undefined) {
        closedRightmostFirst = pushClosed(closedRightmostFirst, tab, index);
      }
    }

    let rebuilt: TabState = { activeId: "id-a.md", tabs: [note("a.md")] };
    for (const entry of closedRightmostFirst) {
      rebuilt = openTabAt(rebuilt, entry.tab, entry.index);
    }

    expect(rebuilt.tabs.map((tab) => tab.path)).toStrictEqual([
      "a.md",
      "b.md",
      "c.md",
      "d.md",
    ]);
  });
});

describe(openTabAt, () => {
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

describe(parseTabs, () => {
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
