import { createStore, useSelector } from "@tanstack/react-store";
import { boolean, maxValue, minValue, number, pipe } from "valibot";

import { readStored, writeStored } from "@/lib/storage";

export type NotePanelTab = "mentions" | "outline" | "tags";

const panel = createStore<{
  /** Bumped each time the panel opens, so it takes focus as the browser does. */
  focus: number;
  open: boolean;
  tab: NotePanelTab;
}>({
  focus: 0,
  open:
    readStored("note-panel-open", boolean(), "could not read note panel") ??
    false,
  tab: "outline",
});

panel.subscribe(({ open }) => {
  writeStored("note-panel-open", open, "could not remember note panel");
});

/** Where the showing editor draws its outline while the panel shows it. */
const outlineHost = createStore<HTMLElement | null>(null);

export function useNotePanel() {
  return useSelector(panel);
}

/** Opens the panel on a tab, or the one it last showed, and focuses it. */
export function openNotePanel(tab?: NotePanelTab) {
  panel.setState((state) => ({
    focus: state.focus + 1,
    open: true,
    tab: tab ?? state.tab,
  }));
}

export function closeNotePanel() {
  panel.setState((state) => ({ ...state, open: false }));
}

export function toggleNotePanel() {
  if (panel.state.open) {
    closeNotePanel();
  } else {
    openNotePanel();
  }
}

export function showNotePanelTab(tab: NotePanelTab) {
  panel.setState((state) => ({ ...state, tab }));
}

export function notePanelHasFocus() {
  return (
    document.activeElement instanceof HTMLElement &&
    document.activeElement.closest("[data-note-panel]") !== null
  );
}

export function readNotePanelWidth(): number {
  return (
    readStored(
      "note-panel-width",
      pipe(number(), minValue(200), maxValue(480)),
      "could not read note panel width"
    ) ?? 260
  );
}

export function rememberNotePanelWidth(width: number): void {
  writeStored("note-panel-width", width, "could not remember note panel width");
}

/**
 * Where a tab's editor draws its outline: the panel's host while the panel
 * shows the outline of the tab that is showing, otherwise nowhere. Every
 * session stays mounted, so the showing tab's is the only one that may draw.
 */
export function useOutlineHost(active: boolean, library: boolean) {
  const { open, tab } = useSelector(panel);
  const host = useSelector(outlineHost);
  // Only a library note has the other toggles, so another tab's panel is its outline.
  const shown = active && open && (!library || tab === "outline");

  return shown ? host : null;
}

export function setOutlineHost(host: HTMLElement | null) {
  outlineHost.setState(() => host);
}
