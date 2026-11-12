import { createStore, useSelector } from "@tanstack/react-store";

import type { FindHandle } from "@/components/editor/find";
import type { NoteMeta } from "@/core/notes";
import { getTabHandles, getTabState, openNote } from "@/lib/tabs/store";
import { getSnippetParts } from "@/lib/utils/fts-snippet";

import { noteBrowserHasFocus } from "./note-browser";
import { hideGraph } from "./view";

const SINGLE_LINE = /[\r\n]/u;

interface FindState {
  available: boolean;
  current: number;
  focusRequest: number;
  open: boolean;
  query: string;
  /** The tab a search result's find belongs to, until someone uses find. */
  searchOwner: string | undefined;
  /** A search result's word has not landed in its editor yet. */
  searchPending: boolean;
  /**
   * The search result's note had more than one match when the search settled.
   * Decided once, so editing the note never makes the bar come or go.
   */
  searchShowsBar: boolean;
  total: number;
}

/** A search result's find shows the bar only when there was a match to step to. */
export function isFindBarShown(state: FindState): boolean {
  return (
    state.open && (state.searchOwner === undefined || state.searchShowsBar)
  );
}

/** One controller per window, lending navigation only to its active editor. */
export function createFindController() {
  const store = createStore<FindState>({
    available: false,
    current: 0,
    focusRequest: 0,
    open: false,
    query: "",
    searchOwner: undefined,
    searchPending: false,
    searchShowsBar: false,
    total: 0,
  });

  let target: FindHandle | null = null;
  let unsubscribe: (() => void) | undefined;
  let seedOnBind = false;
  let targetOwner: string | undefined;
  let input: HTMLInputElement | null = null;
  /** Focus the field cannot take yet, paid when it shows or an editor binds. */
  let owed = false;

  const takeFocus = (element: HTMLInputElement) => {
    owed = false;
    element.focus({ preventScroll: true });
    element.select();
  };

  const refresh = () => {
    const available = target?.alive() === true;
    const snapshot = available ? target?.snapshot() : undefined;
    const current = snapshot?.current ?? 0;
    const total = snapshot?.total ?? 0;

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
    owed = false;
    target?.setQuery(null);
    store.setState((state) => ({
      ...state,
      current: 0,
      open: false,
      searchOwner: undefined,
      searchPending: false,
      total: 0,
    }));
  };

  /** Puts the caret on a search's match and decides whether the bar shows. */
  const land = () => {
    placeCaret();
    store.setState((state) => ({
      ...state,
      searchPending: false,
      searchShowsBar: state.total > 1,
    }));
  };

  // Without a bar, a search's highlight has no close button, so the first
  // caret move or edit after it lands ends it.
  const follow = (moved: boolean) => {
    refresh();

    const { searchOwner, searchPending } = store.state;

    if (
      moved &&
      searchOwner !== undefined &&
      !searchPending &&
      !isFindBarShown(store.state)
    ) {
      dismiss();
    }
  };

  const unbind = () => {
    unsubscribe?.();
    unsubscribe = undefined;
    target?.setClearance(false);
    target?.setQuery(null);
    target = null;
    refresh();
  };

  store.subscribe((state) => {
    target?.setClearance(isFindBarShown(state));
  });

  return {
    attachInput: (element: HTMLInputElement) => {
      input = element;

      if (owed) {
        takeFocus(element);
      }

      return () => {
        if (input === element) {
          input = null;
        }
      };
    },
    /** `owner` is the editor's tab: a search's find ends when another tab binds. */
    bind: (handle: FindHandle, owner?: string) => {
      unbind();
      target = handle;
      targetOwner = owner;

      const { searchOwner } = store.state;

      if (searchOwner !== undefined && owner !== searchOwner) {
        dismiss();
      }

      if (seedOnBind) {
        seedSelection();
        seedOnBind = false;
      }

      unsubscribe = handle.subscribe(follow);
      handle.setQuery(store.state.open ? store.state.query : null);
      refresh();

      if (store.state.searchPending) {
        land();
      }

      if (owed && input !== null) {
        takeFocus(input);
      }

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

      // Without a bar the caret already sits on the match, and selecting it
      // would let the next keystroke replace the word.
      if (isFindBarShown(store.state)) {
        target?.restoreFocus();
      }

      dismiss();
    },
    dismiss,
    /** Into the field now when it shows, otherwise as soon as it does. */
    focus: () => {
      if (input === null) {
        owed = true;
      } else {
        takeFocus(input);
      }
    },
    /** Into the field once the surface ⌘E is swapping in binds. */
    focusOnReturn: () => {
      owed = true;
    },
    navigate: (direction: -1 | 1) => {
      if (target?.alive() !== true || store.state.query === "") {
        return;
      }

      const { open } = store.state;
      store.setState((state) => ({
        ...state,
        focusRequest: open ? state.focusRequest : state.focusRequest + 1,
        open: true,
        searchOwner: undefined,
      }));

      if (!open) {
        target.setQuery(store.state.query);
      }

      target.navigate(direction);
    },
    open: () => {
      seedOnBind = target === null;
      seedSelection();
      store.setState((state) => ({
        ...state,
        focusRequest: state.focusRequest + 1,
        open: true,
        searchOwner: undefined,
      }));
      target?.setQuery(store.state.query);
    },
    /**
     * Highlights `query` with the caret on its match once `owner`'s editor
     * binds. The bar stays hidden unless the note has more than one match,
     * and a hidden one ends on the first caret move or edit.
     */
    search: (query: string, owner: string) => {
      seedOnBind = false;
      store.setState((state) => ({
        ...state,
        open: true,
        query,
        searchOwner: owner,
        searchPending: true,
        searchShowsBar: false,
      }));

      if (target !== null && targetOwner === owner) {
        target.setQuery(query);
        land();
      }
    },
    setQuery: (query: string) => {
      store.setState((state) => ({ ...state, query, searchOwner: undefined }));

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

/**
 * Opens a search result. A title hit opens the note as it is; a body-only hit
 * runs find on its first matched word.
 */
export function openSearchResult(note: NoteMeta, inNewTab: boolean): void {
  const titleHit = getSnippetParts(note.title).some((part) => part.match);

  const hit =
    titleHit || note.snippet === null
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
