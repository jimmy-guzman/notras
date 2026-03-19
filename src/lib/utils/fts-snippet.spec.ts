import { getCenteredSnippetParts, getSnippetParts } from "./fts-snippet";

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

describe("getCenteredSnippetParts", () => {
  it("should keep full snippet when under max length", () => {
    const parts = getCenteredSnippetParts(
      "first [[hl]]match[[/hl]] second",
      80,
    );

    expect(parts).toStrictEqual([
      { id: 0, match: false, text: "first " },
      { id: 1, match: true, text: "match" },
      { id: 2, match: false, text: " second" },
    ]);
  });

  it("should center around the first matched range with ellipses", () => {
    const parts = getCenteredSnippetParts(
      "prefix text one two [[hl]]cosmos[[/hl]] and some long trailing section for snippet",
      24,
    );

    expect(parts.at(0)).toStrictEqual({ id: 0, match: false, text: "..." });
    expect(parts.at(-1)).toStrictEqual({
      id: parts.length - 1,
      match: false,
      text: "...",
    });
    expect(parts.some((part) => part.match && part.text === "cosmos")).toBe(
      true,
    );
  });
});
