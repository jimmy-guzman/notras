/**
 * A note in the library, or a markdown file outside it opened through
 * "Open With". The kind picks the read, the write, and whether the note
 * actions apply (`D54`).
 */
export interface Tab {
  kind: "external" | "note";
  path: string;
}

/** The open set and which one is showing. An empty `activeId` means no tabs. */
export interface TabState {
  activeId: string;
  tabs: Tab[];
}

/** A tab's identity, kind included so a session can read it back off the id. */
export function tabId(tab: Tab) {
  return `${tab.kind}:${tab.path}`;
}

function indexOfId(tabs: Tab[], id: string) {
  return tabs.findIndex((tab) => tabId(tab) === id);
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
  const id = tabId(tab);

  if (indexOfId(state.tabs, id) !== -1) {
    return { activeId: id, tabs: state.tabs };
  }

  const active = indexOfId(state.tabs, state.activeId);

  return {
    activeId: id,
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

  return { activeId: next === undefined ? "" : tabId(next), tabs };
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
  const index = indexOfId(state.tabs, tabId({ kind: "note", path: from }));

  if (index === -1) {
    return state;
  }

  const target: Tab = { kind: "note", path: to };
  const id = tabId(target);
  const wasActive = state.activeId === tabId({ kind: "note", path: from });
  const existing = indexOfId(state.tabs, id);

  if (existing !== -1) {
    return {
      activeId: wasActive ? id : state.activeId,
      tabs: state.tabs.toSpliced(index, 1),
    };
  }

  return {
    activeId: wasActive ? id : state.activeId,
    tabs: state.tabs.with(index, target),
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
  const id = tabId(tab);

  return [
    { index, tab },
    ...closed.filter((entry) => tabId(entry.tab) !== id),
  ].slice(0, CLOSED_LIMIT);
}

/** Put `tab` back at `index`, clamped to the strip as it stands now. */
export function openTabAt(state: TabState, tab: Tab, index: number): TabState {
  const id = tabId(tab);

  if (indexOfId(state.tabs, id) !== -1) {
    return { activeId: id, tabs: state.tabs };
  }

  const at = Math.max(0, Math.min(index, state.tabs.length));

  return { activeId: id, tabs: state.tabs.toSpliced(at, 0, tab) };
}

/** The open set as it survives a quit: the tabs, the active one, and carets. */
export interface PersistedTabs {
  activeId: string;
  /** Caret offset into each tab's markdown body, by tab id. */
  carets: Record<string, number>;
  tabs: Tab[];
}

export function serializeTabs(value: PersistedTabs) {
  return JSON.stringify(value);
}

function toTab(value: unknown): Tab | undefined {
  if (typeof value !== "object" || value === null) {
    return;
  }

  const { kind, path } = value as Record<string, unknown>;

  if ((kind !== "external" && kind !== "note") || typeof path !== "string") {
    return;
  }

  return { kind, path };
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
