import { describe, expect, it } from "vitest";
import { isSafeUrl, normalizeUrl } from "./urls";

describe("isSafeUrl", () => {
  it("should allow schemeless urls and known safe schemes", () => {
    expect(isSafeUrl("example.com")).toBe(true);
    expect(isSafeUrl("https://example.com")).toBe(true);
    expect(isSafeUrl("mailto:hi@jimmy.codes")).toBe(true);
  });

  it("should reject script-bearing schemes", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("JavaScript:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeUrl("vbscript:msgbox(1)")).toBe(false);
  });

  it("should reject unsafe schemes hidden behind blanks a browser strips", () => {
    expect(isSafeUrl("   javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("\u0001javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("java\tscript:alert(1)")).toBe(false);
    expect(isSafeUrl("java\nscript:alert(1)")).toBe(false);
    expect(normalizeUrl("  javascript:alert(1)")).toBeNull();
  });
});

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

  it("should prepend https to a host with a port", () => {
    expect(normalizeUrl("example.com:8080/path")).toBe(
      "https://example.com:8080/path"
    );
  });

  it("should reject empty input", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
  });

  it("should reject unsafe schemes", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("data:text/html,<script>")).toBeNull();
    expect(normalizeUrl("vbscript:msgbox(1)")).toBeNull();
  });
});
