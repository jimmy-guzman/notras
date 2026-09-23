import { createStore, useSelector } from "@tanstack/react-store";

import { toast } from "@/components/ui/toast";
import { reasonOf } from "@/lib/ui/failure";

function readNoteBrowserVisibility() {
  try {
    return localStorage.getItem("note-browser-open") === "true";
  } catch (error) {
    toast.add({
      description: reasonOf(error),
      title: "could not restore note browser",
      type: "error",
    });
    return false;
  }
}

const browser = createStore(readNoteBrowserVisibility());

browser.subscribe((open) => {
  try {
    localStorage.setItem("note-browser-open", String(open));
  } catch (error) {
    toast.add({
      description: reasonOf(error),
      title: "could not remember note browser",
      type: "error",
    });
  }
});

export function readNoteBrowserWidth(): number {
  try {
    const saved = localStorage.getItem("note-browser-width");
    if (saved === null) {
      return 296;
    }
    const width = Number(saved);
    if (!Number.isFinite(width) || width < 200 || width > 480) {
      throw new Error("The saved width must be between 200 and 480 pixels.");
    }
    return width;
  } catch (error) {
    toast.add({
      description: reasonOf(error),
      title: "could not restore note browser width",
      type: "error",
    });
    return 296;
  }
}

export function rememberNoteBrowserWidth(width: number): void {
  try {
    localStorage.setItem("note-browser-width", String(width));
  } catch (error) {
    toast.add({
      description: reasonOf(error),
      title: "could not remember note browser width",
      type: "error",
    });
  }
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
