/**
 * A note in the library, or a markdown file outside it opened through
 * "Open With". The kind picks the read, the write, and whether the note
 * actions apply (`D54`).
 */
export interface Tab {
  /**
   * Stable for as long as the tab is open, and opaque: it survives the rename
   * that gives the tab a new `path`, which is what keeps the editing session
   * alive across one (`D56`). Minted in `store.ts`, so this module stays pure.
   */
  id: string;
  kind: "external" | "note";
  path: string;
}

/** The open set and which one is showing. An empty `activeId` means no tabs. */
export interface TabState {
  activeId: string;
  tabs: Tab[];
}

export function tabId(tab: Tab) {
  return tab.id;
}

function indexOfId(tabs: Tab[], id: string) {
  return tabs.findIndex((tab) => tab.id === id);
}

/**
 * Where the file is open, whatever id the tab carrying it has.
 *
 * Opening, reopening and renaming all ask this rather than comparing ids: one
 * file cannot hold two editing sessions, so they collapse onto the tab that
 * already has it.
 */
function indexOfFile(tabs: Tab[], kind: Tab["kind"], path: string) {
  return tabs.findIndex((tab) => tab.kind === kind && tab.path === path);
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

  if (count === 0) {
    return;
  }

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

  return {
    activeId: tab.id,
    tabs:
      newTab || active === -1
        ? state.tabs.toSpliced(active + 1, 0, tab)
        : state.tabs.with(active, tab),
  };
}

/**
 * Close `id`, handing focus to the tab on its right, then to the one on its
 * left when it was last. Closing the final tab leaves no active tab.
 */
export function closeTab(state: TabState, id: string): TabState {
  const index = indexOfId(state.tabs, id);

  if (index === -1) {
    return state;
  }

  const tabs = state.tabs.toSpliced(index, 1);

  if (state.activeId !== id) {
    return { activeId: state.activeId, tabs };
  }

  const next = tabs[index] ?? tabs.at(-1);

  return { activeId: next?.id ?? "", tabs };
}

/**
 * Follow a note that moved. A rename or a folder move is a new path (`D5`), so
 * the tab holding the old one has to move with it rather than be reopened.
 *
 * Landing on a path that is already open collapses the two, since one file
 * cannot hold two editing sessions.
 */
export function replaceNotePath(
  state: TabState,
  from: string,
  to: string
): TabState {
  const index = indexOfFile(state.tabs, "note", from);
  const moved = state.tabs[index];

  if (moved === undefined || from === to) {
    return state;
  }

  const existing = state.tabs[indexOfFile(state.tabs, "note", to)];

  if (existing !== undefined) {
    return {
      activeId: state.activeId === moved.id ? existing.id : state.activeId,
      tabs: state.tabs.toSpliced(index, 1),
    };
  }

  // `activeId` is untouched: the id outlives the path, which is the point.
  return {
    activeId: state.activeId,
    tabs: state.tabs.with(index, { ...moved, path: to }),
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
 * A tab as it was read back off disk. A store written before `D56` carries no
 * `id`, and keys its carets and active tab by `kind:path` instead. Minting one
 * is `store.ts`'s job, so nothing here has to be impure to read an old store.
 */
export interface PersistedTab {
  id?: string;
  kind: Tab["kind"];
  path: string;
}

/** The open set as it survives a quit: the tabs, the active one, and carets. */
export interface PersistedTabs {
  activeId: string;
  /** Caret offset into each tab's markdown body, by tab id. */
  carets: Record<string, number>;
  tabs: PersistedTab[];
}

/** The key an id-less tab was persisted under, before `D56`. */
export function legacyTabId(tab: PersistedTab) {
  return `${tab.kind}:${tab.path}`;
}

export function serializeTabs(value: PersistedTabs) {
  return JSON.stringify(value);
}

function toTab(value: unknown): PersistedTab | undefined {
  if (typeof value !== "object" || value === null) {
    return;
  }

  const { id, kind, path } = value as Record<string, unknown>;

  if ((kind !== "external" && kind !== "note") || typeof path !== "string") {
    return;
  }

  return typeof id === "string" ? { id, kind, path } : { kind, path };
}

/**
 * Read back what `serializeTabs` wrote, or nothing.
 *
 * A malformed store is rejected whole rather than partly recovered: half a tab
 * set is not a state anyone chose, and the caller already has a launch
 * behaviour for having no tabs.
 */
function readJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseTabs(raw: string): PersistedTabs | undefined {
  const parsed = readJson(raw);

  if (typeof parsed !== "object" || parsed === null) {
    return;
  }

  const { activeId, carets, tabs } = parsed as Record<string, unknown>;

  if (typeof activeId !== "string" || !Array.isArray(tabs)) {
    return;
  }

  const read = tabs.map(toTab);

  if (read.some((tab) => tab === undefined)) {
    return;
  }

  const offsets: Record<string, number> = {};

  if (typeof carets === "object" && carets !== null) {
    for (const [id, offset] of Object.entries(carets)) {
      if (typeof offset === "number" && Number.isFinite(offset)) {
        offsets[id] = offset;
      }
    }
  }

  return {
    activeId,
    carets: offsets,
    tabs: read.filter((tab) => tab !== undefined),
  };
}
