import { useCallback, useSyncExternalStore } from "react";

/**
 * The writing-mode toggles, which belong to the app rather than to a note.
 * Read per-session at mount they would diverge, since several are alive at
 * once (`D53`).
 */
type Pref = "focus-mode" | "typewriter";

const listeners = new Set<() => void>();

const values: Record<Pref, boolean> = {
  "focus-mode": localStorage.getItem("focus-mode") === "true",
  typewriter: localStorage.getItem("typewriter") === "true",
};

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function usePref(name: Pref) {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => values[name], [name])
  );
}

export function togglePref(name: Pref) {
  const next = !values[name];

  values[name] = next;
  localStorage.setItem(name, String(next));

  for (const listener of listeners) {
    listener();
  }
}
