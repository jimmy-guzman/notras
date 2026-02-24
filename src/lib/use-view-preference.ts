import { useEffect, useState, useSyncExternalStore } from "react";

import type { NotesView } from "./view-preference";

import { DEFAULT_VIEW, VIEW_COOKIE_NAME } from "./view-preference";

const STORAGE_KEY = "notras:notes-view";

const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

const listeners = new Set<() => void>();

function getSnapshot(): NotesView {
  const value = localStorage.getItem(STORAGE_KEY);

  return value === "grid" || value === "list" ? value : DEFAULT_VIEW;
}

function getServerSnapshot(): NotesView {
  return DEFAULT_VIEW;
}

function subscribe(callback: () => void) {
  listeners.add(callback);

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      callback();
    }
  };

  globalThis.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(callback);
    globalThis.removeEventListener("storage", handleStorage);
  };
}

function setViewCookie(view: NotesView) {
  document.cookie = `${VIEW_COOKIE_NAME}=${view};path=/;max-age=${String(COOKIE_MAX_AGE)};SameSite=Lax`;
}

function setView(view: NotesView) {
  localStorage.setItem(STORAGE_KEY, view);
  setViewCookie(view);

  for (const listener of listeners) {
    listener();
  }
}

export function useViewPreference() {
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setViewCookie(getSnapshot());
    setIsHydrated(true);
  }, []);

  return [view, setView, isHydrated] as const;
}
