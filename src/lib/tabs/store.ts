import { batch, createStore, useSelector } from "@tanstack/react-store";

import type { SaveStatus } from "@/components/editor/use-autosave";

import type { ClosedTab, Tab, TabState } from "./tab";

import {
  closeTab as closeInList,
  legacyTabId,
  moveTabTo,
  openTab as openInList,
  openTabAt,
  parseTabs,
  pushClosed,
  replaceNotePath,
  serializeTabs,
  tabId,
} from "./tab";

const STORAGE_KEY = "tabs";

/**
 * What a session lends the chrome to act on it, read by id at the moment of
 * use. Never rendered, so registering one notifies nobody.
 */
export interface TabHandles {
  /** The caret's offset in this buffer's markdown, or -1. Read only when the set is persisted. */
  getCaret: () => number;
  /** Into whichever surface is live, since ⌘P swaps which one owns the caret. */
  insertText: (text: string) => void;
  /** Switching surfaces carries the caret through the editor handle, which only the session holds. */
  toggleSource: () => void;
}

/** What a session publishes for the chrome to draw (`D53`). */
export interface TabSnapshot {
  pinned: boolean;
  sourceMode: boolean;
  status: SaveStatus;
  tags: string[];
  title: string;
  words: number;
}

const tabs = createStore<TabState>({ activeId: "", tabs: [] });

const snapshots = createStore<Record<string, TabSnapshot>>({});

let closed: ClosedTab[] = [];
/** Carets read back at launch, each consumed once by the session that mounts. */
const restored = new Map<string, number>();

const handles = new Map<string, TabHandles>();

export function getTabState() {
  return tabs.state;
}

function setState(next: TabState) {
  if (next.activeId === tabs.state.activeId && next.tabs === tabs.state.tabs) {
    return;
  }

  // A tab that left takes both with it. Doing this here rather than at each
  // call site is what covers `openTab` replacing the active tab, where a
  // survivor would let the chrome read a destroyed session.
  const open = new Set(next.tabs.map(tabId));

  for (const id of handles.keys()) {
    if (!open.has(id)) {
      handles.delete(id);
    }
  }

  const dropped = Object.keys(snapshots.state).some((id) => !open.has(id));

  batch(() => {
    if (dropped) {
      snapshots.setState((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([id]) => open.has(id)))
      );
    }

    tabs.setState(() => next);
  });

  persistTabs();
}

/**
 * Write the open set to `localStorage`.
 *
 * Carets are read off the live sessions here rather than tracked as they move:
 * `getCaretSourceOffset` serializes a throwaway clone, far too much per
 * keystroke and nothing at all per open or quit.
 */
export function persistTabs() {
  const carets: Record<string, number> = {};

  for (const tab of getTabState().tabs) {
    const id = tabId(tab);
    const caret = handles.get(id)?.getCaret() ?? -1;

    if (caret >= 0) {
      carets[id] = caret;
    }
  }

  localStorage.setItem(
    STORAGE_KEY,
    serializeTabs({
      activeId: getTabState().activeId,
      carets,
      tabs: getTabState().tabs,
    })
  );
}

/**
 * Reopen last session's tabs, reporting whether any came back. A path that no
 * longer reads closes itself once its session tries it, so nothing is checked
 * against disk here.
 */
export function restoreTabs() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw === null ? undefined : parseTabs(raw);

  if (parsed === undefined || parsed.tabs.length === 0) {
    return false;
  }

  // A store written before `D56` has no ids and keys its carets and active tab
  // by `kind:path`. Minting here, the one place holding both the old key and
  // the new id, keeps a path-shaped id out of the live set and off the DOM.
  const ids = new Map<string, string>();
  const tabList = parsed.tabs.map((tab) => {
    const fresh = tab.id ?? crypto.randomUUID();

    ids.set(tab.id ?? legacyTabId(tab), fresh);

    return { id: fresh, kind: tab.kind, path: tab.path };
  });

  for (const [key, caret] of Object.entries(parsed.carets)) {
    const id = ids.get(key);

    if (id !== undefined) {
      restored.set(id, caret);
    }
  }

  const [first] = tabList;

  // Not through `setState`: it persists, and with no session mounted yet every
  // caret would read as missing and overwrite the set just read.
  tabs.setState(() => ({
    activeId: ids.get(parsed.activeId) ?? first?.id ?? "",
    tabs: tabList,
  }));

  return true;
}

/**
 * The caret this tab was left at. Reading does not consume, because the only
 * caller reads during render and `StrictMode` invokes that twice: consuming on
 * the first pass would hand the second pass nothing.
 */
export function restoredCaret(id: string) {
  return restored.get(id);
}

/** Drop it once the session has mounted, so a later reload starts clean. */
export function clearRestoredCaret(id: string) {
  restored.delete(id);
}

export function useTabState() {
  return useSelector(tabs);
}

export function useTabSnapshot(id: string) {
  return useSelector(snapshots, (all) => all[id]);
}

export function getTabHandles(id: string) {
  return handles.get(id);
}

/** Called once per session. Nothing subscribes, so this does not emit. */
export function registerTabHandles(id: string, next: TabHandles) {
  handles.set(id, next);
}

/** Called by a session on every change it makes to what the chrome shows. */
export function publishTabSnapshot(id: string, snapshot: TabSnapshot) {
  snapshots.setState((prev) => ({ ...prev, [id]: snapshot }));
}

/**
 * A tab's id, minted here rather than in `tab.ts` so the list algebra stays
 * pure and its spec can assert against literal ids (`D56`).
 */
function newTab(kind: Tab["kind"], path: string): Tab {
  return { id: crypto.randomUUID(), kind, path };
}

export function openTab(kind: Tab["kind"], path: string, inNewTab = false) {
  setState(openInList(getTabState(), newTab(kind, path), inNewTab));
}

export function openNote(path: string, inNewTab = false) {
  openTab("note", path, inNewTab);
}

/** Close the tab holding a note path, if one is open. */
export function closeNoteTab(path: string) {
  const open = getTabState().tabs.find(
    (tab) => tab.kind === "note" && tab.path === path
  );

  if (open !== undefined) {
    closeTab(open.id);
  }
}

export function closeTab(id: string) {
  const index = getTabState().tabs.findIndex((entry) => tabId(entry) === id);
  const tab = getTabState().tabs[index];

  if (tab !== undefined) {
    closed = pushClosed(closed, tab, index);
  }

  setState(closeInList(getTabState(), id));
}

/** Put back the most recently closed tab, in the slot it came out of. */
export function reopenTab() {
  const [entry, ...rest] = closed;

  if (entry === undefined) {
    return;
  }

  closed = rest;
  setState(openTabAt(getTabState(), entry.tab, entry.index));
}

/** Close every tab but `id`, which becomes active. */
export function closeOtherTabs(id: string) {
  const keep = getTabState().tabs.find((tab) => tabId(tab) === id);

  if (keep === undefined) {
    return;
  }

  // Rightmost first, so the leftmost ends up on top and reopening walks back
  // left to right into a strip that regrows under it.
  for (const [index, tab] of [...getTabState().tabs.entries()].reverse()) {
    if (tabId(tab) !== id) {
      closed = pushClosed(closed, tab, index);
    }
  }

  setState({ activeId: id, tabs: [keep] });
}

/** Close everything to the right of `id`. */
export function closeTabsAfter(id: string) {
  const index = getTabState().tabs.findIndex((tab) => tabId(tab) === id);

  if (index === -1) {
    return;
  }

  const kept = getTabState().tabs.slice(0, index + 1);
  const active = kept.some((tab) => tabId(tab) === getTabState().activeId)
    ? getTabState().activeId
    : id;

  for (const [offset, tab] of [
    ...getTabState()
      .tabs.slice(index + 1)
      .entries(),
  ].reverse()) {
    closed = pushClosed(closed, tab, index + 1 + offset);
  }

  setState({ activeId: active, tabs: kept });
}

export function moveTab(id: string, index: number) {
  setState(moveTabTo(getTabState(), id, index));
}

export function activateTab(id: string) {
  setState({ activeId: id, tabs: getTabState().tabs });
}

/** Follow a note that a rename or a folder move gave a new path. */
export function renameTab(from: string, to: string) {
  setState(replaceNotePath(getTabState(), from, to));
}
