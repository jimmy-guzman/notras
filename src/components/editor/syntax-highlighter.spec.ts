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

  it("should color added, removed, and hunk lines in a diff", () => {
    const code = "@@ -1,2 +1,2 @@\n kept line\n-old line\n+new line";

    const colored = highlightCode(code, "diff").map(
      ({ color, length, offset }) => ({
        color,
        content: code.slice(offset, offset + length),
      })
    );

    for (const [content, color] of [
      ["@@ -1,2 +1,2 @@", "var(--syntax-member)"],
      ["old line", "var(--syntax-removed)"],
      ["new line", "var(--syntax-added)"],
    ]) {
      expect(colored).toContainEqual({ color, content });
    }

    expect(colored.map(({ content }) => content)).not.toContain(" kept line");
  });
});
