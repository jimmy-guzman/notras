import { createStore, useSelector } from "@tanstack/react-store";

/**
 * The writing-mode toggles, which belong to the app rather than to a note.
 * Read per-session at mount they would diverge, since several are alive at
 * once (`D53`).
 */
type Pref = "focus-mode" | "typewriter";

const prefs = createStore<Record<Pref, boolean>>({
  "focus-mode": localStorage.getItem("focus-mode") === "true",
  typewriter: localStorage.getItem("typewriter") === "true",
});

prefs.subscribe((values) => {
  for (const [name, value] of Object.entries(values)) {
    localStorage.setItem(name, String(value));
  }
});

export function usePref(name: Pref) {
  return useSelector(prefs, (values) => values[name]);
}

export function togglePref(name: Pref) {
  prefs.setState((prev) => ({ ...prev, [name]: !prev[name] }));
}
