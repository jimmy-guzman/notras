import { partitionAssets } from "./assets";

describe("partitionAssets", () => {
  it("should return empty arrays when given no assets", () => {
    const result = partitionAssets([]);

    expect(result).toStrictEqual({ images: [], pdfs: [] });
  });

  it("should put pdf assets into the pdfs array", () => {
    const pdf = { mimeType: "application/pdf" };
    const result = partitionAssets([pdf]);

    expect(result).toStrictEqual({ images: [], pdfs: [pdf] });
  });

  it("should put non-pdf assets into the images array", () => {
    const png = { mimeType: "image/png" };
    const result = partitionAssets([png]);

    expect(result).toStrictEqual({ images: [png], pdfs: [] });
  });

  it("should partition a mix of images and pdfs", () => {
    const png = { mimeType: "image/png" };
    const jpeg = { mimeType: "image/jpeg" };
    const pdf1 = { mimeType: "application/pdf" };
    const pdf2 = { mimeType: "application/pdf" };

    const result = partitionAssets([png, pdf1, jpeg, pdf2]);

    expect(result).toStrictEqual({
      images: [png, jpeg],
      pdfs: [pdf1, pdf2],
    });
  });

  it("should preserve insertion order within each group", () => {
    const a = { mimeType: "image/png", name: "a" };
    const b = { mimeType: "application/pdf", name: "b" };
    const c = { mimeType: "image/webp", name: "c" };
    const d = { mimeType: "application/pdf", name: "d" };

    const result = partitionAssets([a, b, c, d]);

    expect(result.images).toStrictEqual([a, c]);
    expect(result.pdfs).toStrictEqual([b, d]);
  });

  it("should treat all non-pdf mime types as images", () => {
    const assets = [
      { mimeType: "image/png" },
      { mimeType: "image/jpeg" },
      { mimeType: "image/webp" },
      { mimeType: "image/gif" },
      { mimeType: "image/svg+xml" },
    ];

    const result = partitionAssets(assets);

    expect(result).toStrictEqual({ images: assets, pdfs: [] });
  });

  it("should preserve extra properties on assets", () => {
    const asset = { id: "1", mimeType: "image/png", url: "/img.png" };
    const result = partitionAssets([asset]);

    expect(result.images[0]).toBe(asset);
  });
});
