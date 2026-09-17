import { describe, expect, it } from "vitest";

import {
  highlightCode,
  syntaxLanguage,
} from "@/components/editor/syntax-highlighter";

describe("syntax highlighter", () => {
  it("should resolve language aliases while leaving plain and unknown labels unhighlighted", () => {
    expect(syntaxLanguage("ts")).toBe("typescript");
    expect(syntaxLanguage("TSX")).toBe("tsx");
    expect(syntaxLanguage("sh")).toBe("shellscript");
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

  it("should answer each request with its own tokens", async () => {
    const [json, typescript] = await Promise.all([
      highlightCode('{"a": 1}', "json"),
      highlightCode("const a = 1;", "typescript"),
    ]);

    expect(json.flat()).toContainEqual({
      color: "var(--syntax-member)",
      length: 1,
      offset: 2,
    });
    expect(typescript.flat()).toContainEqual({
      color: "var(--syntax-keyword)",
      length: 5,
      offset: 0,
    });
  });

  it("should reject with the reason a grammar cannot load", async () => {
    await expect(highlightCode("x", "not-a-language")).rejects.toThrow(
      /not-a-language/u
    );
  });
});
