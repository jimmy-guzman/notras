"use client";

import type { Asset } from "@/components/notes/assets/asset-list";
import type { NoteId } from "@/lib/id";

import { AssetList } from "@/components/notes/assets/asset-list";
import { AssetUploader } from "@/components/notes/assets/asset-uploader";
import { PdfList } from "@/components/notes/assets/pdf-list";
import { partitionAssets } from "@/lib/utils/assets";

interface EditPageAssetsProps {
  assets: Asset[];
  noteId: NoteId;
}

export function EditPageAssets({ assets, noteId }: EditPageAssetsProps) {
  const { images, pdfs } = partitionAssets(assets);

  return (
    <div className="space-y-6">
      {images.length > 0 && (
        <div>
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">
            images
          </h3>
          <AssetList assets={images} mode="edit" noteId={noteId} />
        </div>
      )}

      {pdfs.length > 0 && (
        <div>
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">
            documents
          </h3>
          <PdfList mode="edit" noteId={noteId} pdfs={pdfs} />
        </div>
      )}

      <div>
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">
          add files
        </h3>
        <AssetUploader noteId={noteId} />
      </div>
    </div>
  );
}
