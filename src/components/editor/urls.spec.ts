import { normalizeUrl } from "./urls";

describe("normalizeUrl", () => {
  it("should keep urls that already carry a scheme", () => {
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeUrl("mailto:hi@jimmy.codes")).toBe("mailto:hi@jimmy.codes");
    expect(normalizeUrl("obsidian://open")).toBe("obsidian://open");
  });

  it("should prepend https to schemeless urls", () => {
    expect(normalizeUrl("example.com/path")).toBe("https://example.com/path");
    expect(normalizeUrl("  example.com  ")).toBe("https://example.com");
  });

  it("should reject empty input", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
  });
});
