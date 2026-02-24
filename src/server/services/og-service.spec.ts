import { describe, expect, it, vi } from "vitest";

import { fetchOgMetadata } from "./og-service";

describe("fetchOgMetadata", () => {
  it("should extract og:title and og:description from HTML", async () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Example Title" />
          <meta property="og:description" content="Example Description" />
        </head>
      </html>
    `;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(html, { status: 200 }),
    );

    const result = await fetchOgMetadata("https://example.com");

    expect(result).toStrictEqual({
      description: "Example Description",
      title: "Example Title",
    });
  });

  it("should handle content attribute before property attribute", async () => {
    const html = `
      <html>
        <head>
          <meta content="Reversed Title" property="og:title" />
          <meta content="Reversed Description" property="og:description" />
        </head>
      </html>
    `;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(html, { status: 200 }),
    );

    const result = await fetchOgMetadata("https://example.com");

    expect(result).toStrictEqual({
      description: "Reversed Description",
      title: "Reversed Title",
    });
  });

  it("should return null values when no OG tags are present", async () => {
    const html = `
      <html>
        <head><title>No OG</title></head>
      </html>
    `;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(html, { status: 200 }),
    );

    const result = await fetchOgMetadata("https://example.com");

    expect(result).toStrictEqual({
      description: null,
      title: null,
    });
  });

  it("should return null values on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not Found", { status: 404 }),
    );

    const result = await fetchOgMetadata("https://example.com/404");

    expect(result).toStrictEqual({
      description: null,
      title: null,
    });
  });

  it("should return null values on fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    const result = await fetchOgMetadata("https://unreachable.test");

    expect(result).toStrictEqual({
      description: null,
      title: null,
    });
  });

  it("should return null values on timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new DOMException("The operation was aborted.", "AbortError"),
    );

    const result = await fetchOgMetadata("https://slow.test");

    expect(result).toStrictEqual({
      description: null,
      title: null,
    });
  });

  it("should handle single quotes in meta tags", async () => {
    const html = `
      <html>
        <head>
          <meta property='og:title' content='Single Quoted' />
        </head>
      </html>
    `;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(html, { status: 200 }),
    );

    const result = await fetchOgMetadata("https://example.com");

    expect(result).toStrictEqual({
      description: null,
      title: "Single Quoted",
    });
  });

  it("should handle self-closing meta tags", async () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Self Closing">
        </head>
      </html>
    `;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(html, { status: 200 }),
    );

    const result = await fetchOgMetadata("https://example.com");

    expect(result).toStrictEqual({
      description: null,
      title: "Self Closing",
    });
  });
});
