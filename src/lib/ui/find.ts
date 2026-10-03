import { createStore, useSelector } from "@tanstack/react-store";

import type { FindHandle } from "@/components/editor/find";
import type { NoteMeta } from "@/core/notes";
import { getTabHandles, getTabState, openNote } from "@/lib/tabs/store";
import { hideGraph } from "@/lib/ui/graph";
import { noteBrowserHasFocus } from "@/lib/ui/note-browser";
import { getSnippetParts } from "@/lib/utils/fts-snippet";

const SINGLE_LINE = /[\r\n]/u;

/** One controller per window, lending navigation only to its active editor. */
export function createFindController() {
  const store = createStore({
    available: false,
    current: 0,
    focusRequest: 0,
    open: false,
    query: "",
    /** A search result's word is waiting for its editor to bind. */
    searchPending: false,
    total: 0,
  });
  let target: FindHandle | null = null;
  let unsubscribe: (() => void) | undefined;
  let seedOnBind = false;
  let targetOwner: string | undefined;
  let searchOwner: string | undefined;
  const refresh = () => {
    const available = target?.alive() === true;
    // A search between notes keeps the count it showed until the next one binds.
    const kept = !available && store.state.searchPending;
    const snapshot = available ? target?.snapshot() : undefined;
    const current = kept ? store.state.current : (snapshot?.current ?? 0);
    const total = kept ? store.state.total : (snapshot?.total ?? 0);
    if (
      store.state.available !== available ||
      store.state.current !== current ||
      store.state.total !== total
    ) {
      store.setState((state) => ({ ...state, available, current, total }));
    }
  };
  const seedSelection = () => {
    const selection = target?.selectionText() ?? "";
    if (selection !== "" && !SINGLE_LINE.test(selection)) {
      store.setState((state) => ({ ...state, query: selection }));
    }
  };
  const placeCaret = () => {
    if (!noteBrowserHasFocus()) {
      target?.caretToMatch();
    }
  };
  /** Closes find without moving focus or the caret. */
  const dismiss = () => {
    searchOwner = undefined;
    target?.setQuery(null);
    store.setState((state) => ({
      ...state,
      current: 0,
      open: false,
      searchPending: false,
      total: 0,
    }));
  };
  const unbind = () => {
    unsubscribe?.();
    unsubscribe = undefined;
    target?.setQuery(null);
    target = null;
    refresh();
  };
  return {
    /** `owner` is the editor's tab: a search's find ends when another tab binds. */
    bind: (handle: FindHandle, owner?: string) => {
      unbind();
      target = handle;
      targetOwner = owner;
      if (searchOwner !== undefined && owner !== searchOwner) {
        dismiss();
      }
      if (seedOnBind) {
        seedSelection();
        seedOnBind = false;
      }
      unsubscribe = handle.subscribe(refresh);
      handle.setQuery(store.state.open ? store.state.query : null);
      if (store.state.searchPending) {
        store.setState((state) => ({ ...state, searchPending: false }));
        placeCaret();
      } else {
        store.setState((state) => ({
          ...state,
          focusRequest:
            state.focusRequest + Number(state.open && !noteBrowserHasFocus()),
        }));
      }
      refresh();
      return () => {
        if (target === handle) {
          unbind();
        }
      };
    },
    close: () => {
      if (!store.state.open) {
        return;
      }
      target?.restoreFocus();
      dismiss();
    },
    dismiss,
    navigate: (direction: -1 | 1) => {
      if (target?.alive() !== true || store.state.query === "") {
        return;
      }
      searchOwner = undefined;
      if (!store.state.open) {
        store.setState((state) => ({
          ...state,
          focusRequest: state.focusRequest + 1,
          open: true,
        }));
        target.setQuery(store.state.query);
      }
      target.navigate(direction);
    },
    open: () => {
      searchOwner = undefined;
      seedOnBind = target === null;
      seedSelection();
      store.setState((state) => ({
        ...state,
        focusRequest: state.focusRequest + 1,
        open: true,
      }));
      target?.setQuery(store.state.query);
    },
    /** Opens on `query` with the caret on its match and the bar unfocused, once `owner`'s editor binds. */
    search: (query: string, owner: string) => {
      seedOnBind = false;
      searchOwner = owner;
      const searchPending = target === null || targetOwner !== owner;
      store.setState((state) => ({
        ...state,
        open: true,
        query,
        searchPending,
      }));
      if (!searchPending) {
        target?.setQuery(query);
        placeCaret();
      }
    },
    setQuery: (query: string) => {
      searchOwner = undefined;
      store.setState((state) => ({ ...state, query }));
      if (store.state.open) {
        target?.setQuery(query);
      }
    },
    store,
  };
}

export const noteFind = createFindController();

export function useNoteFind() {
  return useSelector(noteFind.store);
}

export function openNoteFind(): void {
  const { activeId } = getTabState();
  if (getTabHandles(activeId) === undefined) {
    return;
  }
  hideGraph(activeId);
  noteFind.open();
}

/** Opens a search result, running find on its first body hit when it has one. */
export function openSearchResult(note: NoteMeta, inNewTab: boolean): void {
  const hit =
    note.snippet === null
      ? undefined
      : getSnippetParts(note.snippet).find((part) => part.match)?.text;
  openNote(note.path, inNewTab);
  if (hit === undefined) {
    noteFind.dismiss();
    return;
  }
  const { activeId } = getTabState();
  hideGraph(activeId);
  noteFind.search(hit, activeId);
}
