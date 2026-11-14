import { describe, expect, it } from "vitest";

import { highlightCode, syntaxLanguage } from "./syntax-highlighter";

describe("syntax highlighter", () => {
  it("should resolve language names and aliases while leaving plain and unknown labels unhighlighted", () => {
    expect(syntaxLanguage("ts")).toBe("ts");
    expect(syntaxLanguage("TSX")).toBe("tsx");
    expect(syntaxLanguage("typescript")).toBe("typescript");
    expect(syntaxLanguage("console")).toBe("shellsession");
    expect(syntaxLanguage("f18")).toBe("fortran-free-form");
    expect(syntaxLanguage("mbti")).toBe("moonbit");

    for (const label of [
      null,
      "",
      "text",
      "plain",
      "plaintext",
      "not-a-language",
    ]) {
      expect(syntaxLanguage(label)).toBeUndefined();
    }
  });

  it("should color each run with the ink role of its category", () => {
    expect(highlightCode('{"a": 1}', "json")).toStrictEqual([
      { color: "var(--syntax-punctuation)", length: 1, offset: 0 },
      { color: "var(--syntax-member)", length: 3, offset: 1 },
      { color: "var(--syntax-punctuation)", length: 2, offset: 4 },
      { color: "var(--syntax-number)", length: 1, offset: 6 },
      { color: "var(--syntax-punctuation)", length: 1, offset: 7 },
    ]);
  });

  it("should leave runs in the text color out", () => {
    expect(highlightCode("const a = 1;", "ts")).not.toContainEqual(
      expect.objectContaining({ offset: 6 })
    );
  });

  it("should count offsets from the start of the code across line endings, blank lines and wide characters", () => {
    const code = 'const a = "😀";\r\n\r\nconst b = "字";';

    expect(
      highlightCode(code, "ts")
        .filter(({ color }) => color === "var(--syntax-string)")
        .map(({ length, offset }) => code.slice(offset, offset + length))
    ).toStrictEqual(['"😀"', '"字"']);
  });

  it("should color an operator spelled as a word like a keyword and a symbol like an operator", () => {
    const code = "WHERE a = 1 AND b IS NOT NULL";

    const colored = highlightCode(code, "sql").map(
      ({ color, length, offset }) => ({
        color,
        content: code.slice(offset, offset + length),
      })
    );

    expect(colored).toContainEqual({
      color: "var(--syntax-keyword)",
      content: "AND ",
    });
    expect(colored).toContainEqual({
      color: "var(--syntax-keyword)",
      content: "IS NOT ",
    });
    expect(colored).toContainEqual({
      color: "var(--syntax-operator)",
      content: "= ",
    });
  });

  it("should color each diff line whole, marker included, by what it records", () => {
    const code = [
      "diff --git a/f b/f",
      "index 12ab..34cd 100644",
      "--- a/f",
      "+++ b/f",
      "@@ -1,3 +1,3 @@",
      " kept line",
      "-old line",
      "--- old sql comment",
      "+new line",
      "*** a/f",
      "--- b/f",
      "***************",
      "*** 1 ****",
      "! changed line",
      "--- 1 ----",
    ].join("\n");

    const colored = highlightCode(code, "diff").map(
      ({ color, length, offset }) => ({
        color,
        content: code.slice(offset, offset + length),
      })
    );

    expect(colored).toStrictEqual([
      { color: "var(--syntax-comment)", content: "diff --git a/f b/f" },
      { color: "var(--syntax-comment)", content: "index 12ab..34cd 100644" },
      { color: "var(--syntax-comment)", content: "--- a/f" },
      { color: "var(--syntax-comment)", content: "+++ b/f" },
      { color: "var(--syntax-member)", content: "@@ -1,3 +1,3 @@" },
      { color: "var(--syntax-removed)", content: "-old line" },
      { color: "var(--syntax-removed)", content: "--- old sql comment" },
      { color: "var(--syntax-added)", content: "+new line" },
      { color: "var(--syntax-comment)", content: "*** a/f" },
      { color: "var(--syntax-comment)", content: "--- b/f" },
      { color: "var(--syntax-comment)", content: "***************" },
      { color: "var(--syntax-comment)", content: "*** 1 ****" },
      { color: "var(--syntax-changed)", content: "! changed line" },
      { color: "var(--syntax-comment)", content: "--- 1 ----" },
    ]);
  });

  it("should color a data constructor like a type", () => {
    const code = "f = Just 1";

    expect(
      highlightCode(code, "haskell").map(({ color, length, offset }) => ({
        color,
        content: code.slice(offset, offset + length),
      }))
    ).toContainEqual({ color: "var(--syntax-type)", content: "Just " });
  });
});
