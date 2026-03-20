import { getHighlightedParts } from "./highlight";

describe("getHighlightedParts", () => {
  it("should return the full text as non-matching when query is empty", () => {
    const parts = getHighlightedParts("Hello world", "");

    expect(parts).toStrictEqual([
      { id: -1, match: false, text: "Hello world" },
    ]);
  });

  it("should highlight matching part of text (case insensitive)", () => {
    const parts = getHighlightedParts("Hello world", "hello");

    expect(parts).toStrictEqual([
      { id: 1, match: true, text: "Hello" },
      { id: 2, match: false, text: " world" },
    ]);
  });

  it("should highlight multiple matches in the text", () => {
    const parts = getHighlightedParts("Hello world hello", "hello");

    expect(parts).toStrictEqual([
      { id: 1, match: true, text: "Hello" },
      { id: 2, match: false, text: " world " },
      { id: 3, match: true, text: "hello" },
    ]);
  });

  it("should correctly escape special regex characters in query", () => {
    const parts = getHighlightedParts("Is 2+2=4?", "2+2");

    expect(parts).toStrictEqual([
      { id: 0, match: false, text: "Is " },
      { id: 1, match: true, text: "2+2" },
      { id: 2, match: false, text: "=4?" },
    ]);
  });

  it("should highlight partial matches inside words", () => {
    const parts = getHighlightedParts("there is them", "the");

    expect(parts).toStrictEqual([
      { id: 1, match: true, text: "the" },
      { id: 2, match: false, text: "re is " },
      { id: 3, match: true, text: "the" },
      { id: 4, match: false, text: "m" },
    ]);
  });

  it("should handle full exact matches", () => {
    const parts = getHighlightedParts("Hello", "Hello");

    expect(parts).toStrictEqual([{ id: 1, match: true, text: "Hello" }]);
  });

  it("should highlight multiple terms from a spaced query", () => {
    const parts = getHighlightedParts("alpha beta gamma", "alpha   gamma");

    expect(parts).toStrictEqual([
      { id: 1, match: true, text: "alpha" },
      { id: 2, match: false, text: " beta " },
      { id: 3, match: true, text: "gamma" },
    ]);
  });
});
