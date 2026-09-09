import { createStore, useSelector } from "@tanstack/react-store";
import type { FindHandle } from "@/components/editor/find";
import { getTabHandles, getTabState } from "@/lib/tabs/store";
import { hideGraph } from "@/lib/ui/graph";

const SINGLE_LINE = /[\r\n]/;

/** One controller per window, lending navigation only to its active editor. */
export function createFindController() {
  const store = createStore({
    available: false,
    current: 0,
    focusRequest: 0,
    open: false,
    query: "",
    total: 0,
  });
  let target: FindHandle | null = null;
  let unsubscribe: (() => void) | undefined;
  let seedOnBind = false;
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
  const unbind = () => {
    unsubscribe?.();
    unsubscribe = undefined;
    target?.setQuery(null);
    target = null;
    refresh();
  };
  return {
    bind: (handle: FindHandle) => {
      unbind();
      target = handle;
      if (seedOnBind) {
        seedSelection();
        seedOnBind = false;
      }
      unsubscribe = handle.subscribe(refresh);
      handle.setQuery(store.state.open ? store.state.query : null);
      store.setState((state) => ({
        ...state,
        focusRequest: state.focusRequest + Number(state.open),
      }));
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
      target?.setQuery(null);
      store.setState((state) => ({
        ...state,
        current: 0,
        open: false,
        total: 0,
      }));
    },
    navigate: (direction: -1 | 1) => {
      if (!target?.alive() || store.state.query === "") {
        return;
      }
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
      seedOnBind = target === null;
      seedSelection();
      store.setState((state) => ({
        ...state,
        focusRequest: state.focusRequest + 1,
        open: true,
      }));
      target?.setQuery(store.state.query);
    },
    setQuery: (query: string) => {
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
