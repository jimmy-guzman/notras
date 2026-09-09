import { createStore, useSelector } from "@tanstack/react-store";

/**
 * Focus mode belongs to the app rather than to a note. Read per-session at
 * mount it would diverge, since several sessions are alive at once.
 */
const focusMode = createStore(localStorage.getItem("focus-mode") === "true");

focusMode.subscribe((enabled) => {
  localStorage.setItem("focus-mode", String(enabled));
});

export function useFocusMode() {
  return useSelector(focusMode);
}

export function toggleFocusMode() {
  focusMode.setState((enabled) => !enabled);
}
