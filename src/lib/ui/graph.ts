import { createStore, useSelector } from "@tanstack/react-store";

import { getTabState, openNote } from "@/lib/tabs/store";

/**
 * The tabs showing their graph, by id. A hop replaces the showing tab with a
 * new one, so the flag lives here rather than in the session that dies with
 * it. In memory only, so it does not survive a relaunch, like source mode.
 */
const graphs = createStore<ReadonlySet<string>>(new Set<string>());

export function useGraphMode(id: string) {
  return useSelector(graphs, (ids) => ids.has(id));
}

export function showGraph(id: string) {
  graphs.setState((ids) => new Set(ids).add(id));
}

export function hideGraph(id: string) {
  graphs.setState((ids) => {
    const next = new Set(ids);

    next.delete(id);

    return next;
  });
}

export function toggleGraph(id: string) {
  if (graphs.state.has(id)) {
    hideGraph(id);
  } else {
    showGraph(id);
  }
}

/** Open a neighbour and stay in the graph, whichever tab that lands on. */
export function hopTo(path: string, beside: boolean) {
  openNote(path, beside);
  showGraph(getTabState().activeId);
}
