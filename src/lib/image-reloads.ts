import { createStore } from "@tanstack/react-store";

/**
 * Each reported library path or folder, lowered, with the count of the last
 * report that named it. The empty path is the whole library. `external`
 * counts the reloads of every image outside it.
 */
const reloads = createStore({
  count: 0,
  external: 0,
  scopes: new Map<string, number>(),
});

// A plain image keeps the path as its note wrote it while the watcher reports
// the one on disk, and the two differ in case on a case-insensitive disk.
function scopeKey(path: string) {
  return path.toLowerCase().replace(/\/$/u, "");
}

/**
 * Has every library image at one of `paths`, or inside a folder among them,
 * load its file again. No paths means the whole library.
 */
export function reloadImages(paths: readonly string[]): void {
  // The whole library outranks every count before it.
  reloads.setState(({ count, external, scopes }) => ({
    count: count + 1,
    external,
    scopes:
      paths.length === 0
        ? new Map([["", count + 1]])
        : new Map([
            ...scopes,
            ...paths.map((path) => [scopeKey(path), count + 1] as const),
          ]),
  }));
}

/** The number of the last reload that covered the library image at `path`, or 0 before any, so its URL changes with each. */
export function imageVersion(path: string): number {
  const key = scopeKey(path);

  return Math.max(
    0,
    ...reloads.state.scopes
      .entries()
      .filter(
        ([scope]) =>
          scope === "" || key === scope || key.startsWith(`${scope}/`)
      )
      .map(([, count]) => count)
  );
}

/** Has every image in a file outside the library load its file again. */
export function reloadExternalImages(): void {
  reloads.setState((state) => ({ ...state, external: state.external + 1 }));
}

/** The number of reloads of images outside the library, so their URLs change with each. */
export function externalImageVersion(): number {
  return reloads.state.external;
}

/** Calls `listener` after each reload. Returns what stops the calls. */
export function onImagesReloaded(listener: () => void): () => void {
  return reloads.subscribe(listener).unsubscribe;
}
