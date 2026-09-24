import { createStore, useSelector } from "@tanstack/react-store";
import { boolean, maxValue, minValue, number, pipe } from "valibot";

import { readStored, writeStored } from "@/lib/storage";

const browser = createStore(
  readStored(
    "note-browser-open",
    boolean(),
    "could not read note browser visibility"
  ) ?? false
);

browser.subscribe((open) => {
  writeStored("note-browser-open", open, "could not remember note browser");
});

export function readNoteBrowserWidth(): number {
  return (
    readStored(
      "note-browser-width",
      pipe(number(), minValue(200), maxValue(480)),
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
