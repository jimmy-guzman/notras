import { beforeEach, describe, expect, it } from "vitest";

import { getTabState, restoredCaret, restoreTabs } from "./store";
import { serializeTabs } from "./tab";

const STORAGE_KEY = "tabs";

/** A store as versions before `D56` wrote it: no ids, keys are `kind:path`. */
function writeLegacyStore() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      activeId: "note:b.md",
      carets: { "note:a.md": 12, "note:b.md": 34 },
      tabs: [
        { kind: "note", path: "a.md" },
        { kind: "note", path: "b.md" },
      ],
    })
  );
}

describe("restoreTabs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should report nothing to restore when no store was written", () => {
    expect(restoreTabs()).toBe(false);
  });

  it("should reopen the tabs a current store holds", () => {
    localStorage.setItem(
      STORAGE_KEY,
      serializeTabs({
        activeId: "kept-b",
        carets: { "kept-b": 7 },
        tabs: [
          { id: "kept-a", kind: "note", path: "a.md" },
          { id: "kept-b", kind: "note", path: "b.md" },
        ],
      })
    );

    expect(restoreTabs()).toBe(true);
    expect(getTabState().tabs.map((tab) => tab.id)).toStrictEqual([
      "kept-a",
      "kept-b",
    ]);
    expect(getTabState().activeId).toBe("kept-b");
    expect(restoredCaret("kept-b")).toBe(7);
  });

  it("should reopen a store written before tabs had ids", () => {
    writeLegacyStore();

    expect(restoreTabs()).toBe(true);
    expect(getTabState().tabs.map((tab) => tab.path)).toStrictEqual([
      "a.md",
      "b.md",
    ]);
  });

  it("should mint ids that carry no path, for a store written without them", () => {
    writeLegacyStore();
    restoreTabs();

    // A path-shaped id reaches `aria-controls` and breaks the reference as
    // soon as a filename contains a space, which is what `D56` removes.
    for (const tab of getTabState().tabs) {
      expect(tab.id).not.toContain(tab.path);
    }
  });

  it("should carry the active tab and every caret onto the minted ids", () => {
    writeLegacyStore();
    restoreTabs();

    const [a, b] = getTabState().tabs;

    expect(getTabState().activeId).toBe(b?.id);
    expect(restoredCaret(a?.id ?? "")).toBe(12);
    expect(restoredCaret(b?.id ?? "")).toBe(34);
  });
});
