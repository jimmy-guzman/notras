import { afterEach, describe, expect, it } from "vitest";

import {
  readNoteBrowserWidth,
  rememberNoteBrowserWidth,
} from "@/lib/ui/note-browser";

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
