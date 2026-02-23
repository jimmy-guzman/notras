interface HasMimeType {
  mimeType: string;
}

export function partitionAssets<T extends HasMimeType>(assets: T[]) {
  const images: T[] = [];
  const pdfs: T[] = [];

  for (const asset of assets) {
    if (asset.mimeType === "application/pdf") {
      pdfs.push(asset);
    } else {
      images.push(asset);
    }
  }

  return { images, pdfs };
}
