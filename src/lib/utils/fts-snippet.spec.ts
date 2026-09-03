import { describe, expect, it } from "vitest";
import { getSnippetParts } from "./fts-snippet";

describe("getSnippetParts", () => {
  it("should split plain snippet text without matches", () => {
    const parts = getSnippetParts("hello world");

    expect(parts).toStrictEqual([{ id: 0, match: false, text: "hello world" }]);
  });

  it("should mark highlighted snippet ranges", () => {
    const parts = getSnippetParts("first [[hl]]match[[/hl]] second");

    expect(parts).toStrictEqual([
      { id: 0, match: false, text: "first " },
      { id: 2, match: true, text: "match" },
      { id: 4, match: false, text: " second" },
    ]);
  });
});
