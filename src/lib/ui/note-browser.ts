import { createStore, useSelector } from "@tanstack/react-store";
import { boolean, maxValue, minValue, number, picklist, pipe } from "valibot";

import { readStored, writeStored } from "@/lib/storage";

// Open on first launch, so a new user sees where search lives before
// having to find it; after that it remembers what they left.
const browser = createStore(
  readStored(
    "note-browser-open",
    boolean(),
    "could not read note browser visibility"
  ) ?? true
);

browser.subscribe((open) => {
  writeStored("note-browser-open", open, "could not remember note browser");
});

/** The browser's modes, in the order of their buttons. */
export const NOTE_BROWSER_MODES = [
  "folders",
  "tags",
  "recent",
  "pinned",
] as const;

export type NoteBrowserMode = (typeof NOTE_BROWSER_MODES)[number];

const shownMode = createStore<NoteBrowserMode>(
  readStored(
    "note-browser-mode",
    picklist(NOTE_BROWSER_MODES),
    "could not read note browser mode"
  ) ?? "folders"
);

shownMode.subscribe((mode) => {
  writeStored(
    "note-browser-mode",
    mode,
    "could not remember note browser mode"
  );
});

/** The browser's band at its narrowest: the traffic lights, the browser's button, the four modes and search. */
export const NOTE_BROWSER_MIN_WIDTH = 240;
export const NOTE_BROWSER_MAX_WIDTH = 480;

export function readNoteBrowserWidth(): number {
  return (
    readStored(
      "note-browser-width",
      pipe(
        number(),
        minValue(NOTE_BROWSER_MIN_WIDTH),
        maxValue(NOTE_BROWSER_MAX_WIDTH)
      ),
      "could not read note browser width"
    ) ?? 296
  );
}

export function rememberNoteBrowserWidth(width: number): void {
  writeStored(
    "note-browser-width",
    width,
    "could not remember note browser width"
  );
}

export function useNoteBrowser() {
  return useSelector(browser);
}

export function useNoteBrowserMode() {
  return useSelector(shownMode);
}

/** Shows a mode of the browser, opening the browser when it is closed. */
export function showNoteBrowserMode(mode: NoteBrowserMode) {
  shownMode.setState(() => mode);
  browser.setState(() => true);
}

export function toggleNoteBrowser() {
  browser.setState((open) => !open);
}

export function closeNoteBrowser() {
  browser.setState(() => false);
}

export function noteBrowserHasFocus() {
  return (
    document.activeElement instanceof HTMLElement &&
    document.activeElement.closest("[data-note-browser]") !== null
  );
}
