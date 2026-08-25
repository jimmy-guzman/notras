import { useCallback, useSyncExternalStore } from "react";

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
 * What a session publishes for the chrome to draw (`D53`).
 *
 * `toggleSource` rides along because switching surfaces carries the caret
 * through the editor handle, which only the session holds.
 */
export interface TabSnapshot {
  /** The caret's offset in this buffer's markdown, or -1. Read only when the set is persisted. */
  getCaret: () => number;
  /** Into whichever surface is live, since ⌘P swaps which one owns the caret. */
  insertText: (text: string) => void;
  pinned: boolean;
  sourceMode: boolean;
  status: SaveStatus;
  tags: string[];
  title: string;
  toggleSource: () => void;
  words: number;
}

let state: TabState = { activeId: "", tabs: [] };
let closed: ClosedTab[] = [];
/** Carets read back at launch, each consumed once by the session that mounts. */
const restored = new Map<string, number>();

const snapshots = new Map<string, TabSnapshot>();
const listeners = new Set<() => void>();
const readers = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function setState(next: TabState) {
  if (next.activeId === state.activeId && next.tabs === state.tabs) {
    return;
  }

  // A tab that left takes its snapshot with it. Doing this here rather than at
  // each call site is what covers `openTab` replacing the active tab, where a
  // surviving snapshot would let the chrome read a destroyed session.
  const open = new Set(next.tabs.map(tabId));

  for (const id of snapshots.keys()) {
    if (!open.has(id)) {
      snapshots.delete(id);
    }
  }

  state = next;
  emit();
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

  for (const tab of state.tabs) {
    const id = tabId(tab);
    const caret = snapshots.get(id)?.getCaret() ?? -1;

    if (caret >= 0) {
      carets[id] = caret;
    }
  }

  localStorage.setItem(
    STORAGE_KEY,
    serializeTabs({ activeId: state.activeId, carets, tabs: state.tabs })
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
  const tabs = parsed.tabs.map((tab) => {
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

  const [first] = tabs;

  state = {
    activeId: ids.get(parsed.activeId) ?? first?.id ?? "",
    tabs,
  };
  emit();

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

export function getTabState() {
  return state;
}

export function useTabState() {
  return useSyncExternalStore(subscribe, getTabState);
}

export function getTabSnapshot(id: string) {
  return snapshots.get(id);
}

export function useTabSnapshot(id: string) {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => getTabSnapshot(id), [id])
  );
}

/**
 * Re-read this session's file whenever the folder changes. The watcher fires
 * one `notes-changed` for the whole folder, and every live session reconciles
 * off that one signal.
 */
export function subscribeRevision(reader: () => void) {
  readers.add(reader);

  return () => {
    readers.delete(reader);
  };
}

export function bumpRevision() {
  for (const reader of readers) {
    reader();
  }
}

/** Called by a session on every change it makes to what the chrome shows. */
export function publishTabSnapshot(id: string, snapshot: TabSnapshot) {
  const current = snapshots.get(id);

  if (
    current !== undefined &&
    current.getCaret === snapshot.getCaret &&
    current.insertText === snapshot.insertText &&
    current.pinned === snapshot.pinned &&
    current.sourceMode === snapshot.sourceMode &&
    current.status === snapshot.status &&
    current.tags === snapshot.tags &&
    current.title === snapshot.title &&
    current.toggleSource === snapshot.toggleSource &&
    current.words === snapshot.words
  ) {
    return;
  }

  snapshots.set(id, snapshot);
  emit();
}

/**
 * A tab's id, minted here rather than in `tab.ts` so the list algebra stays
 * pure and its spec can assert against literal ids (`D56`).
 */
function newTab(kind: Tab["kind"], path: string): Tab {
  return { id: crypto.randomUUID(), kind, path };
}

export function openTab(kind: Tab["kind"], path: string, inNewTab = false) {
  setState(openInList(state, newTab(kind, path), inNewTab));
}

export function openNote(path: string, inNewTab = false) {
  openTab("note", path, inNewTab);
}

/** Close the tab holding a note path, if one is open. */
export function closeNoteTab(path: string) {
  const open = state.tabs.find(
    (tab) => tab.kind === "note" && tab.path === path
  );

  if (open !== undefined) {
    closeTab(open.id);
  }
}

export function closeTab(id: string) {
  const index = state.tabs.findIndex((entry) => tabId(entry) === id);
  const tab = state.tabs[index];

  if (tab !== undefined) {
    closed = pushClosed(closed, tab, index);
  }

  setState(closeInList(state, id));
}

/** Put back the most recently closed tab, in the slot it came out of. */
export function reopenTab() {
  const [entry, ...rest] = closed;

  if (entry === undefined) {
    return;
  }

  closed = rest;
  setState(openTabAt(state, entry.tab, entry.index));
}

/** Close every tab but `id`, which becomes active. */
export function closeOtherTabs(id: string) {
  const keep = state.tabs.find((tab) => tabId(tab) === id);

  if (keep === undefined) {
    return;
  }

  // Rightmost first, so the leftmost ends up on top and reopening walks back
  // left to right into a strip that regrows under it.
  for (const [index, tab] of [...state.tabs.entries()].reverse()) {
    if (tabId(tab) !== id) {
      closed = pushClosed(closed, tab, index);
    }
  }

  setState({ activeId: id, tabs: [keep] });
}

/** Close everything to the right of `id`. */
export function closeTabsAfter(id: string) {
  const index = state.tabs.findIndex((tab) => tabId(tab) === id);

  if (index === -1) {
    return;
  }

  const kept = state.tabs.slice(0, index + 1);
  const active = kept.some((tab) => tabId(tab) === state.activeId)
    ? state.activeId
    : id;

  for (const [offset, tab] of [
    ...state.tabs.slice(index + 1).entries(),
  ].reverse()) {
    closed = pushClosed(closed, tab, index + 1 + offset);
  }

  setState({ activeId: active, tabs: kept });
}

export function moveTab(id: string, index: number) {
  setState(moveTabTo(state, id, index));
}

export function activateTab(id: string) {
  setState({ activeId: id, tabs: state.tabs });
}

/** Follow a note that a rename or a folder move gave a new path. */
export function renameTab(from: string, to: string) {
  setState(replaceNotePath(state, from, to));
}
