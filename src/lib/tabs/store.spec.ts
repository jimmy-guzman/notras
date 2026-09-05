import { beforeEach, describe, expect, it } from "vitest";

import {
  adoptVaultNotes,
  closeTab,
  getTabHandles,
  getTabState,
  openNote,
  registerTabHandles,
  restoredCaret,
  restoreTabs,
} from "./store";
import { parseTabs, serializeTabs } from "./tab";

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

describe("adoptVaultNotes", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should adopt an external tab the classifier calls a note", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      serializeTabs({
        activeId: "kept-x",
        carets: {},
        tabs: [{ id: "kept-x", kind: "external", path: "/vault/a.md" }],
      })
    );
    restoreTabs();

    await adoptVaultNotes(async () => [{ kind: "note", path: "a.md" }]);

    expect(getTabState().tabs).toStrictEqual([
      { id: "kept-x", kind: "note", path: "a.md" },
    ]);
    expect(
      parseTabs(localStorage.getItem(STORAGE_KEY) ?? "")?.tabs
    ).toStrictEqual([{ id: "kept-x", kind: "note", path: "a.md" }]);
  });

  it("should leave alone a tab the classifier keeps external", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      serializeTabs({
        activeId: "kept-x",
        carets: {},
        tabs: [{ id: "kept-x", kind: "external", path: "/elsewhere/a.md" }],
      })
    );
    restoreTabs();

    await adoptVaultNotes(async (paths) =>
      paths.map((path) => ({ kind: "external", path }))
    );

    expect(getTabState().tabs).toStrictEqual([
      { id: "kept-x", kind: "external", path: "/elsewhere/a.md" },
    ]);
  });

  it("should keep the restored tabs when the classifier rejects", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      serializeTabs({
        activeId: "kept-x",
        carets: {},
        tabs: [{ id: "kept-x", kind: "external", path: "/vault/a.md" }],
      })
    );
    restoreTabs();

    await expect(
      adoptVaultNotes(() => Promise.reject(new Error("no answer")))
    ).rejects.toThrow("no answer");
    expect(getTabState().tabs).toStrictEqual([
      { id: "kept-x", kind: "external", path: "/vault/a.md" },
    ]);
  });

  it("should not ask when no external tab was restored", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      serializeTabs({
        activeId: "kept-a",
        carets: {},
        tabs: [{ id: "kept-a", kind: "note", path: "a.md" }],
      })
    );
    restoreTabs();

    await adoptVaultNotes(() => Promise.reject(new Error("asked")));

    expect(getTabState().tabs.map((tab) => tab.id)).toStrictEqual(["kept-a"]);
  });
});

describe("registerTabHandles", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should hand back the handles a live tab registered", () => {
    openNote("a.md");
    const [tab] = getTabState().tabs;
    const handles = {
      getCaret: () => 7,
      insertText: () => undefined,
      toggleSource: () => undefined,
    };

    registerTabHandles(tab?.id ?? "", handles);

    expect(getTabHandles(tab?.id ?? "")?.getCaret()).toBe(7);
  });

  it("should forget a tab's handles once it closes", () => {
    openNote("b.md");
    const [tab] = getTabState().tabs;
    const id = tab?.id ?? "";

    registerTabHandles(id, {
      getCaret: () => 7,
      insertText: () => undefined,
      toggleSource: () => undefined,
    });
    closeTab(id);

    expect(getTabHandles(id)).toBeUndefined();
  });
});
