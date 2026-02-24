import { describe, expect, it } from "vitest";

import { extractUrls } from "./link-service";

describe("extractUrls", () => {
  it("should extract bare HTTP URLs", () => {
    const content = "Check out https://example.com for more info.";

    expect(extractUrls(content)).toStrictEqual(["https://example.com"]);
  });

  it("should extract bare HTTP URLs with http scheme", () => {
    const content = "Visit http://example.com today.";

    expect(extractUrls(content)).toStrictEqual(["http://example.com"]);
  });

  it("should extract multiple URLs", () => {
    const content = "See https://a.com and https://b.com for details.";

    expect(extractUrls(content)).toStrictEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("should extract URLs from Markdown links", () => {
    const content = "Read [this article](https://example.com/article) now.";

    expect(extractUrls(content)).toStrictEqual(["https://example.com/article"]);
  });

  it("should deduplicate URLs that appear both bare and in Markdown", () => {
    const content =
      "https://example.com and [link](https://example.com) are the same.";

    expect(extractUrls(content)).toStrictEqual(["https://example.com"]);
  });

  it("should deduplicate identical bare URLs", () => {
    const content =
      "https://example.com first, then https://example.com again.";

    expect(extractUrls(content)).toStrictEqual(["https://example.com"]);
  });

  it("should return empty array when no URLs are present", () => {
    const content = "Just some plain text with no links.";

    expect(extractUrls(content)).toStrictEqual([]);
  });

  it("should handle URLs with paths, query params, and fragments", () => {
    const content =
      "Visit https://example.com/path?q=test&page=1#section for details.";

    expect(extractUrls(content)).toStrictEqual([
      "https://example.com/path?q=test&page=1#section",
    ]);
  });

  it("should not extract non-HTTP URLs", () => {
    const content = "Not a URL: htp://bad or ftp://also-bad.";

    expect(extractUrls(content)).toStrictEqual([]);
  });

  it("should handle URLs at end of line", () => {
    const content = "Check https://example.com\nNew line here.";

    expect(extractUrls(content)).toStrictEqual(["https://example.com"]);
  });
});
