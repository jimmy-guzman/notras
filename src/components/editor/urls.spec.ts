import { describe, expect, it } from "vitest";

import { isSafeUrl, normalizeUrl } from "./urls";

describe(isSafeUrl, () => {
  it("should allow schemeless urls and known safe schemes", () => {
    expect(isSafeUrl("example.com")).toBeTruthy();
    expect(isSafeUrl("https://example.com")).toBeTruthy();
    expect(isSafeUrl("mailto:hi@jimmy.codes")).toBeTruthy();
  });

  it("should reject script-bearing schemes", () => {
    // oxlint-disable-next-line no-script-url -- the refused scheme is the case under test
    expect(isSafeUrl("javascript:alert(1)")).toBeFalsy();
    // oxlint-disable-next-line no-script-url -- the refused scheme is the case under test
    expect(isSafeUrl("JavaScript:alert(1)")).toBeFalsy();
    expect(isSafeUrl("data:text/html;base64,PHNjcmlwdD4=")).toBeFalsy();
    expect(isSafeUrl("vbscript:msgbox(1)")).toBeFalsy();
  });

  it("should reject unsafe schemes hidden behind blanks a browser strips", () => {
    expect(isSafeUrl("   javascript:alert(1)")).toBeFalsy();
    expect(isSafeUrl("\u0001javascript:alert(1)")).toBeFalsy();
    expect(isSafeUrl("java\tscript:alert(1)")).toBeFalsy();
    expect(isSafeUrl("java\nscript:alert(1)")).toBeFalsy();
    expect(normalizeUrl("  javascript:alert(1)")).toBeNull();
  });
});

describe(normalizeUrl, () => {
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
    // oxlint-disable-next-line no-script-url -- the refused scheme is the case under test
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("data:text/html,<script>")).toBeNull();
    expect(normalizeUrl("vbscript:msgbox(1)")).toBeNull();
  });
});
