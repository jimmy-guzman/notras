import {
  array,
  check,
  finite,
  number,
  object,
  picklist,
  pipe,
  record,
  string,
} from "valibot";

import type { OpenKind } from "@/server/adapters/bindings";

/**
 * A note in the library, a markdown file outside it opened through "Open
 * With", or a draft: a new note with no file yet. The kind picks the read,
 * the write, and whether the note actions apply. A draft's `path` is `""`
 * until its first save creates the file, which turns it into a note.
 */
export interface Tab {
  /**
   * Stable for as long as the tab is open, and opaque: it survives the rename
   * that gives the tab a new `path`, which is what keeps the editing session
   * alive across one. Minted in `store.ts`, so this module stays pure.
   */
  id: string;
  kind: "draft" | "external" | "note";
  /**
   * The tab that was showing when this one opened beside it, so closing this
   * one returns there. Dropped on restore: a tab that survived a relaunch is
   * not fresh.
   */
  opener?: string;
  path: string;
}

/** What backs a tab on disk. A draft is a note whose file does not exist yet. */
export function fileKind(kind: Tab["kind"]): OpenKind {
  return kind === "external" ? "external" : "note";
}

/** The open set and which one is showing. An empty `activeId` means no tabs. */
export interface TabState {
  activeId: string;
  tabs: Tab[];
}

/**
 * Where a tab's file is on disk. A note's path is relative to the notes dir
 * and an external file's is already absolute, so the two need joining before
 * anything outside the app can use one.
 */
export function tabFullPath(tab: Tab, notesDir: string) {
  return tab.kind === "note" ? `${notesDir}/${tab.path}` : tab.path;
}

function indexOfId(tabs: Tab[], id: string) {
  return tabs.findIndex((tab) => tab.id === id);
}

/**
 * Where the file is open, whatever id the tab carrying it has.
 *
 * Opening, reopening and renaming all ask this rather than comparing ids: one
 * file cannot hold two editing sessions, so they collapse onto the tab that
 * already has it. A draft has no file, so it never collapses.
 */
function indexOfFile(tabs: Tab[], kind: Tab["kind"], path: string) {
  return kind === "draft"
    ? -1
    : tabs.findIndex((tab) => tab.kind === kind && tab.path === path);
}

/**
 * The DOM ids pairing a tab with its panel. One place, because `aria-controls`
 * and `aria-labelledby` have to agree from opposite ends of the tree.
 */
export function tabButtonId(id: string) {
  return `tab-${id}`;
}

export function tabPanelId(id: string) {
  return `panel-${id}`;
}

export type TabStep = "end" | "next" | "previous" | "start";

/** Where a keyboard step lands, wrapping at both ends. */
export function stepTab(state: TabState, step: TabStep): Tab | undefined {
  const count = state.tabs.length;

  if (step === "start") {
    return state.tabs[0];
  }

  if (step === "end") {
    return state.tabs.at(-1);
  }

  const index = indexOfId(state.tabs, state.activeId);

  if (index === -1) {
    return state.tabs[0];
  }

  return state.tabs[(index + (step === "next" ? 1 : -1) + count) % count];
}

/**
 * Open `tab`, replacing the active one unless `newTab`.
 *
 * A tab that is already open is focused rather than duplicated, which is what
 * keeps the strip from growing every time a wikilink points back at something.
 */
export function openTab(state: TabState, tab: Tab, newTab = false): TabState {
  const open = state.tabs[indexOfFile(state.tabs, tab.kind, tab.path)];

  if (open !== undefined) {
    return { activeId: open.id, tabs: state.tabs };
  }

  const active = indexOfId(state.tabs, state.activeId);
  const showing = state.tabs[active];

  return {
    activeId: tab.id,
    tabs:
      newTab || active === -1
        ? state.tabs.toSpliced(active + 1, 0, { ...tab, opener: showing?.id })
        : state.tabs.with(active, { ...tab, opener: showing?.opener }),
  };
}

/**
 * Close `id`, handing focus to the tab that opened it while that one is still
 * open, then to the tab on its right, then to the one on its left when it was
 * last. Closing the final tab leaves no active tab.
 */
export function closeTab(state: TabState, id: string): TabState {
  const index = indexOfId(state.tabs, id);

  if (index === -1) {
    return state;
  }

  const opener = state.tabs[index]?.opener;
  const tabs = state.tabs.toSpliced(index, 1);

  if (state.activeId !== id) {
    return { activeId: state.activeId, tabs };
  }

  const next =
    tabs.find((tab) => tab.id === opener) ?? tabs[index] ?? tabs.at(-1);

  return { activeId: next?.id ?? "", tabs };
}

/**
 * The set with every draft closed. The showing one goes first, and the next
 * showing one after it, so the active id follows the opener chain back to a
 * tab with a file wherever the drafts sit in the strip.
 */
export function closeDrafts(state: TabState): TabState {
  let next = state;
  let showing = next.tabs[indexOfId(next.tabs, next.activeId)];

  while (showing?.kind === "draft") {
    next = closeTab(next, showing.id);
    showing = next.tabs[indexOfId(next.tabs, next.activeId)];
  }

  for (const tab of next.tabs) {
    if (tab.kind === "draft") {
      next = closeTab(next, tab.id);
    }
  }

  return next;
}

/**
 * Follow a file that moved. A rename or a folder move is a new path, so the
 * tab holding the old one has to move with it rather than be reopened. A
 * draft's first save is the same move from no path to one, and makes it a note.
 *
 * Landing on a path that is already open collapses the two, since one file
 * cannot hold two editing sessions.
 */
export function replaceNotePath(
  state: TabState,
  id: string,
  to: string
): TabState {
  const index = indexOfId(state.tabs, id);
  const moved = state.tabs[index];

  if (moved === undefined || moved.path === to) {
    return state;
  }

  const kind = fileKind(moved.kind);
  const existing = state.tabs[indexOfFile(state.tabs, kind, to)];

  if (existing !== undefined) {
    return {
      activeId: state.activeId === moved.id ? existing.id : state.activeId,
      tabs: state.tabs.toSpliced(index, 1),
    };
  }

  // `activeId` is untouched: the id outlives the path, which is the point.
  return {
    activeId: state.activeId,
    tabs: state.tabs.with(index, { ...moved, kind, path: to }),
  };
}

/**
 * Turn the external tab `id` into the note at `path`, collapsing onto that
 * note's tab when it is already open.
 */
export function adoptNote(state: TabState, id: string, path: string): TabState {
  const index = indexOfId(state.tabs, id);
  const adopted = state.tabs[index];

  if (adopted === undefined) {
    return state;
  }

  const existing = state.tabs[indexOfFile(state.tabs, "note", path)];

  if (existing !== undefined) {
    return {
      activeId: state.activeId === adopted.id ? existing.id : state.activeId,
      tabs: state.tabs.toSpliced(index, 1),
    };
  }

  return {
    activeId: state.activeId,
    tabs: state.tabs.with(index, { ...adopted, kind: "note", path }),
  };
}

/** Move `id` to `index`, clamped to the ends. */
export function moveTabTo(
  state: TabState,
  id: string,
  index: number
): TabState {
  const from = indexOfId(state.tabs, id);
  const tab = state.tabs[from];

  if (tab === undefined) {
    return state;
  }

  const to = Math.max(0, Math.min(index, state.tabs.length - 1));

  if (to === from) {
    return state;
  }

  return {
    activeId: state.activeId,
    tabs: state.tabs.toSpliced(from, 1).toSpliced(to, 0, tab),
  };
}

const CLOSED_LIMIT = 10;

/** A closed tab and the slot it came out of, so reopening can put it back. */
export interface ClosedTab {
  index: number;
  tab: Tab;
}

/**
 * Push onto the reopen stack, most recent first. Closing the same path twice
 * moves its one entry to the top rather than stacking a duplicate.
 */
export function pushClosed(
  closed: ClosedTab[],
  tab: Tab,
  index: number
): ClosedTab[] {
  return [
    { index, tab },
    ...closed.filter(
      (entry) => entry.tab.kind !== tab.kind || entry.tab.path !== tab.path
    ),
  ].slice(0, CLOSED_LIMIT);
}

/** Put `tab` back at `index`, clamped to the strip as it stands now. */
export function openTabAt(state: TabState, tab: Tab, index: number): TabState {
  const open = state.tabs[indexOfFile(state.tabs, tab.kind, tab.path)];

  if (open !== undefined) {
    return { activeId: open.id, tabs: state.tabs };
  }

  const at = Math.max(0, Math.min(index, state.tabs.length));

  return { activeId: tab.id, tabs: state.tabs.toSpliced(at, 0, tab) };
}

/**
 * Carets are offsets into each tab's markdown body. A tab held twice, by id or
 * by file, is rejected: one file cannot hold two editing sessions, and ids key
 * every map in the store.
 */
export const PersistedTabsSchema = object({
  activeId: string(),
  carets: record(string(), pipe(number(), finite())),
  tabs: pipe(
    array(
      object({
        id: string(),
        kind: picklist(["external", "note"]),
        path: string(),
      })
    ),
    check(
      (tabs) =>
        new Set(tabs.map((tab) => tab.id)).size === tabs.length &&
        new Set(tabs.map((tab) => `${tab.kind}:${tab.path}`)).size ===
          tabs.length
    )
  ),
});

export function serializeTabs(
  value: TabState & { carets: Record<string, number> }
) {
  return JSON.stringify(value);
}
