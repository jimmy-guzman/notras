import { batch, createStore, useSelector } from "@tanstack/react-store";
import type { ReadonlyStore } from "@tanstack/react-store";

import type { SaveStatus } from "@/components/editor/use-autosave";
import type { FrontmatterEdit } from "@/core/frontmatter";
import { rememberNote } from "@/lib/recent-notes";
import type { PendingOpen } from "@/server/adapters/bindings";

import type { ClosedTab, Tab, TabState } from "./tab";
import {
  adoptNote,
  closeDrafts,
  closeTab as closeInList,
  legacyTabId,
  moveTabTo,
  openTab as openInList,
  openTabAt,
  parseTabs,
  pushClosed,
  replaceNotePath,
  serializeTabs,
} from "./tab";

const STORAGE_KEY = "tabs";

/**
 * What a session lends the bars and the palette to act on it, read by id at the moment of
 * use. Never rendered, so registering one notifies nobody.
 */
export interface TabHandles {
  /** Present when a loaded note session can flush and follow a native path change. */
  changePath?: (
    change:
      | { kind: "move"; folder: string }
      | { kind: "retitle"; title: string }
  ) => Promise<void>;
  editMetadata?: (edit: FrontmatterEdit) => Promise<void>;
  /** Save the rich view as a PDF and answer its path, null when cancelled, or refuse with the reason the toast shows. */
  exportPdf: () => Promise<string | null>;
  /** The caret's offset in this buffer's markdown, or -1. Read only when the set is persisted. */
  getCaret: () => number;
  /** Into whichever surface is live, since ⌘P swaps which one owns the caret. */
  insertText: (text: string) => void;
  /** Switching surfaces carries the caret through the editor handle, which only the session holds. */
  toggleSource: () => void;
}

/** What a session publishes for the bars and the palette to draw (`D53`). */
export interface TabSnapshot {
  pinned: boolean;
  /** Why the last save failed, or why a review could not be stored. */
  reason: string | undefined;
  sourceMode: boolean;
  status: SaveStatus;
  tags: string[];
  title: string;
  words: number;
}

const tabs = createStore<TabState>({ activeId: "", tabs: [] });

const snapshots = createStore<Record<string, ReadonlyStore<TabSnapshot>>>({});
const emptySnapshot = createStore<TabSnapshot | undefined>(undefined);

let closed: ClosedTab[] = [];
let chosenTab: string | undefined;
const loadedNotes = new Map<string, string>();
/** Carets read back at launch, each consumed once by the session that mounts. */
const restored = new Map<string, number>();

const handles = new Map<string, TabHandles>();
const refreshers = new Map<string, () => Promise<void>>();

export function getTabState() {
  return tabs.state;
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
    const { id } = tab;
    const caret = handles.get(id)?.getCaret() ?? restored.get(id) ?? -1;

    if (caret >= 0) {
      carets[id] = caret;
    }
  }

  // Drafts are not restored, and the active id lands where closing them would.
  const persisted = closeDrafts(getTabState());

  localStorage.setItem(
    STORAGE_KEY,
    serializeTabs({
      activeId: persisted.activeId,
      carets,
      tabs: persisted.tabs,
    })
  );
}

function setState(next: TabState) {
  if (next.activeId === tabs.state.activeId && next.tabs === tabs.state.tabs) {
    return;
  }

  if (next.activeId !== chosenTab) {
    chosenTab = undefined;
  }
  // A tab that left takes both with it. Doing this here rather than at each
  // call site is what covers `openTab` replacing the active tab, where a
  // survivor would let the bars read a destroyed session.
  const open = new Set(next.tabs.map((tab) => tab.id));

  for (const id of loadedNotes.keys()) {
    if (!open.has(id)) {
      loadedNotes.delete(id);
    }
  }

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

  setState({
    activeId: ids.get(parsed.activeId) ?? first?.id ?? "",
    tabs: tabList,
  });

  return true;
}

/**
 * A store an older build wrote holds a vault note opened through "Open With"
 * as an external tab. Ask which restored external tabs are notes today and
 * adopt those, so one file never carries two sessions.
 */
export async function adoptVaultNotes(
  classify: (paths: string[]) => Promise<PendingOpen[]>
) {
  const external = getTabState().tabs.filter((tab) => tab.kind === "external");

  if (external.length === 0) {
    return;
  }

  const classified = await classify(external.map((tab) => tab.path));

  let state = getTabState();
  for (const [index, tab] of external.entries()) {
    const open = classified[index];
    if (open?.kind === "note") {
      state = adoptNote(state, tab.id, open.path);
    }
  }
  setState(state);
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

/** Whether a session has mounted for this tab, so the workspace keeps it mounted. */
export function hasTabSnapshot(id: string) {
  return snapshots.state[id] !== undefined;
}

export function useTabState() {
  return useSelector(tabs);
}

export function useTabSnapshot(id: string) {
  const source = useSelector(snapshots, (all) => all[id]);
  return useSelector<TabSnapshot | undefined>(source ?? emptySnapshot);
}

export function getTabHandles(id: string) {
  return handles.get(id);
}

/** Called once per session. Nothing subscribes, so this does not emit. */
export function registerTabHandles(id: string, next: TabHandles) {
  handles.set(id, next);
}

/** Connect the bars to the session's derived state for its mounted lifetime. */
/**
 * How a tab re-reads its file when the disk may have changed. The latest
 * registration wins, and releasing an older one leaves the newer in place.
 */
export function registerTabRefresh(id: string, refresh: () => Promise<void>) {
  refreshers.set(id, refresh);
  return () => {
    if (refreshers.get(id) === refresh) {
      refreshers.delete(id);
    }
  };
}

/** Ask every open tab that `holds` matches to re-read its file. */
export function refreshTabs(holds: (tab: Tab) => boolean) {
  for (const tab of getTabState().tabs) {
    if (holds(tab)) {
      void refreshers.get(tab.id)?.();
    }
  }
}

export function registerTabSnapshot(
  id: string,
  snapshot: ReadonlyStore<TabSnapshot>
) {
  snapshots.setState((prev) => ({ ...prev, [id]: snapshot }));
  return () => {
    if (snapshots.state[id] !== snapshot) {
      return;
    }
    snapshots.setState((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([key]) => key !== id))
    );
  };
}

/**
 * A tab's id, minted here rather than in `tab.ts` so the list algebra stays
 * pure and its spec can assert against literal ids (`D56`).
 */
function newTab(kind: Tab["kind"], path: string): Tab {
  return { id: crypto.randomUUID(), kind, path };
}

function rememberChosenTab() {
  const tab = getTabState().tabs.find((entry) => entry.id === chosenTab);
  const notesDir = tab === undefined ? undefined : loadedNotes.get(tab.id);
  if (tab?.kind === "note" && notesDir !== undefined) {
    chosenTab = undefined;
    rememberNote(notesDir, tab.path);
  }
}

/** Complete a deliberate opening only after its document and stored review loaded. */
export function registerLoadedNote(id: string, notesDir: string): () => void {
  loadedNotes.set(id, notesDir);
  rememberChosenTab();
  return () => {
    loadedNotes.delete(id);
  };
}

/** A failed read cannot turn a later automatic refresh into a visit. */
export function cancelNoteVisit(id: string): void {
  loadedNotes.delete(id);
  if (chosenTab === id) {
    chosenTab = undefined;
  }
}

function chooseActiveTab() {
  chosenTab = getTabState().activeId;
  rememberChosenTab();
}

/** Open the launch fallback without recording a choice. */
export function openInitialNote(path: string): void {
  setState(openInList(getTabState(), newTab("note", path)));
}

export function openTab(kind: Tab["kind"], path: string, inNewTab = false) {
  setState(openInList(getTabState(), newTab(kind, path), inNewTab));
  chooseActiveTab();
}

export function openNote(path: string, inNewTab = false) {
  openTab("note", path, inNewTab);
}

export function openDraft() {
  openTab("draft", "", true);
}

export function closeTab(id: string) {
  const index = getTabState().tabs.findIndex((entry) => entry.id === id);
  const tab = getTabState().tabs[index];

  // A draft leaves nothing behind, so there is nothing to reopen.
  if (tab !== undefined && tab.kind !== "draft") {
    closed = pushClosed(closed, tab, index);
  }

  setState(closeInList(getTabState(), id));
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

/** Put back the most recently closed tab, in the slot it came out of. */
export function reopenTab() {
  const [entry, ...rest] = closed;

  if (entry === undefined) {
    return;
  }

  closed = rest;
  setState(openTabAt(getTabState(), entry.tab, entry.index));
  chooseActiveTab();
}

/** Close every tab but `id`, which becomes active. */
export function closeOtherTabs(id: string) {
  const keep = getTabState().tabs.find((tab) => tab.id === id);

  if (keep === undefined) {
    return;
  }

  // Rightmost first, so the leftmost ends up on top and reopening walks back
  // left to right into a strip that regrows under it.
  for (const [index, tab] of [...getTabState().tabs.entries()].toReversed()) {
    if (tab.id !== id) {
      closed = pushClosed(closed, tab, index);
    }
  }

  setState({ activeId: id, tabs: [keep] });
}

/** Close everything to the right of `id`. */
export function closeTabsAfter(id: string) {
  const index = getTabState().tabs.findIndex((tab) => tab.id === id);

  if (index === -1) {
    return;
  }

  const kept = getTabState().tabs.slice(0, index + 1);
  const active = kept.some((tab) => tab.id === getTabState().activeId)
    ? getTabState().activeId
    : id;

  for (const [offset, tab] of [
    ...getTabState()
      .tabs.slice(index + 1)
      .entries(),
  ].toReversed()) {
    closed = pushClosed(closed, tab, index + 1 + offset);
  }

  setState({ activeId: active, tabs: kept });
}

export function moveTab(id: string, index: number) {
  setState(moveTabTo(getTabState(), id, index));
}

/** Show a tab without recording a visit. */
export function showTab(id: string): void {
  setState({ activeId: id, tabs: getTabState().tabs });
}

export function activateTab(id: string) {
  showTab(id);
  chooseActiveTab();
}

/** Follow a tab whose save gave it a new path: a rename, a move, or a draft's first file. */
export function renameTab(id: string, to: string, notesDir: string) {
  const previous = getTabState().tabs.find((tab) => tab.id === id);
  setState(replaceNotePath(getTabState(), id, to));
  if (previous?.kind === "draft" && getTabState().activeId === id) {
    chosenTab = undefined;
    rememberNote(notesDir, to);
  }
}

/** Edit metadata through the note that owns the live document. */
export async function changeNoteMetadata(
  path: string,
  edit: FrontmatterEdit
): Promise<void> {
  const tab = tabs.state.tabs.find(
    (entry) => entry.path === path && entry.kind === "note"
  );
  const apply =
    tab === undefined ? undefined : handles.get(tab.id)?.editMetadata;
  if (apply === undefined) {
    throw new Error("The note is still opening");
  }
  await apply(edit);
}
