import { createStore, useSelector } from "@tanstack/react-store";
import { boolean } from "valibot";

import { readStored, writeStored } from "@/lib/storage";

/**
 * Focus mode belongs to the app rather than to a note. Read per-session at
 * mount it would diverge, since several sessions are alive at once.
 */
const focusMode = createStore(
  readStored("focus-mode", boolean(), "could not read focus mode") ?? false
);

focusMode.subscribe((enabled) => {
  writeStored("focus-mode", enabled, "could not remember focus mode");
});

export function useFocusMode() {
  return useSelector(focusMode);
}

export function toggleFocusMode() {
  focusMode.setState((enabled) => !enabled);
}
