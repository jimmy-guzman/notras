import { createStore, useSelector } from "@tanstack/react-store";

import {
  getTabHandles,
  getTabSnapshot,
  getTabState,
  openNote,
  subscribeTabState,
  useTabSnapshot,
} from "@/lib/tabs/store";

/** The three ways a tab shows its file. */
export type TabView = "graph" | "note" | "source";

/**
 * The tabs showing their graph, by id. A hop replaces the showing tab with a
 * new one, so the flag lives here rather than in the session that dies with
 * it. In memory only, so it does not survive a relaunch, like source mode.
 */
const graphs = createStore<ReadonlySet<string>>(new Set<string>());

function holdsNote(id: string) {
  return getTabState().tabs.find((tab) => tab.id === id)?.kind === "note";
}

export function useGraphMode(id: string) {
  return useSelector(graphs, (ids) => ids.has(id));
}

/** Only one graph shows at a time, so the latest registration is the one on screen. */
let focusCentre: (() => void) | undefined;

export function registerGraphFocus(focus: () => void) {
  focusCentre = focus;

  return () => {
    if (focusCentre === focus) {
      focusCentre = undefined;
    }
  };
}

export function focusGraph() {
  focusCentre?.();
}

/** Only ids of tabs still holding a library note, so a closed, replaced or reclassified tab's flag does not linger. */
function alive(ids: ReadonlySet<string>) {
  return new Set([...ids].filter((id) => holdsNote(id)));
}

// A folder change turns a note tab external under the same id and touches no
// graph, so the flag is pruned on every tab change, or it would return if the
// tab became a note again.
subscribeTabState(() => {
  graphs.setState(alive);
});

/** Only a library note has a graph, so asking another tab for one does nothing. */
export function showGraph(id: string) {
  if (holdsNote(id)) {
    graphs.setState((ids) => new Set(ids).add(id));
  }
}

export function hideGraph(id: string) {
  graphs.setState((ids) => ids.difference(new Set([id])));
}

/** Open a neighbour and stay in the graph, whichever tab that lands on. */
export function hopTo(path: string, beside: boolean) {
  openNote(path, beside);
  showGraph(getTabState().activeId);
}

/** The graph covers the editor, so it wins over the source mode it returns to. */
function viewOf(graph: boolean, source: boolean) {
  if (graph) {
    return "graph";
  }

  return source ? "source" : "note";
}

export function useTabView(id: string): TabView {
  const graph = useGraphMode(id);
  const snapshot = useTabSnapshot(id);

  return viewOf(graph, snapshot?.sourceMode ?? false);
}

export function showView(id: string, view: TabView) {
  if (view === "graph") {
    showGraph(id);
  } else {
    hideGraph(id);
    getTabHandles(id)?.setSource(view === "source");
  }
}

/**
 * What a chord or a palette row does: show the view, or, when it already
 * shows, leave it for the view under it. The graph returns to the editor it
 * covered and the source to the note; the note has nothing under it and stays.
 */
export function pressView(id: string, view: TabView) {
  const showing = viewOf(
    graphs.state.has(id),
    getTabSnapshot(id)?.sourceMode ?? false
  );

  if (showing !== view) {
    showView(id, view);
  } else if (view === "graph") {
    hideGraph(id);
  } else if (view === "source") {
    getTabHandles(id)?.setSource(false);
  }
}
