import { renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";

import {
  readNoteBrowserWidth,
  rememberNoteBrowserWidth,
} from "@/lib/ui/note-browser";

describe("note browser startup", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.removeItem("note-browser-open");
  });

  afterEach(() => {
    localStorage.removeItem("note-browser-open");
  });

  it.each([
    { open: false, saved: null },
    { open: false, saved: "false" },
    { open: true, saved: "true" },
  ])("should restore visibility from $saved", async ({ open, saved }) => {
    if (saved !== null) {
      localStorage.setItem("note-browser-open", saved);
    }
    const { useNoteBrowser } = await import("@/lib/ui/note-browser");
    const { result } = renderHook(useNoteBrowser);
    expect(result.current).toBe(open);
  });

  it("should start collapsed when reading the visibility preference fails", async () => {
    const read = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("Storage access is denied", "SecurityError");
    });
    onTestFinished(() => {
      read.mockRestore();
    });
    const { useNoteBrowser } = await import("@/lib/ui/note-browser");
    const { result } = renderHook(useNoteBrowser);
    expect(result.current).toBeFalsy();
  });
});

describe("note browser width", () => {
  afterEach(() => {
    localStorage.removeItem("note-browser-width");
  });

  it("should start at 296 pixels without a saved width", () => {
    expect(readNoteBrowserWidth()).toBe(296);
  });

  it("should restore a chosen width from storage", () => {
    rememberNoteBrowserWidth(360);
    expect(localStorage.getItem("note-browser-width")).toBe("360");
    expect(readNoteBrowserWidth()).toBe(360);
  });
});
