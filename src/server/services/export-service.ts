import { TextEncoder } from "node:util";

import { zipSync } from "fflate";

import type { NoteId } from "@/lib/id";
import type { AssetRepository } from "@/server/repositories/asset-repository";
import type { NoteRepository } from "@/server/repositories/note-repository";
import type {
  ExportedAsset,
  ExportedNote,
  Manifest,
} from "@/server/schemas/export-schemas";

import { db } from "@/server/db";
import { DBAssetRepository } from "@/server/repositories/asset-repository";
import { DBNoteRepository } from "@/server/repositories/note-repository";

function buildAssetPath(noteId: NoteId, assetId: string, fileName: string) {
  return `assets/${noteId}/${assetId}_${fileName}`;
}

class ExportService {
  constructor(
    private noteRepo: NoteRepository,
    private assetRepo: AssetRepository,
  ) {}

  async exportAll(userId: string): Promise<Uint8Array> {
    const notes = await this.noteRepo.findMany(userId, {});

    const exportedNotes: ExportedNote[] = [];
    const assetFiles: Record<string, Uint8Array> = {};

    let assetCount = 0;

    for (const n of notes) {
      const noteId = n.id as NoteId;
      const assets = await this.assetRepo.findByNoteId(noteId, userId);

      const exportedAssets: ExportedAsset[] = assets.map((a) => {
        const path = buildAssetPath(noteId, a.id, a.fileName);

        assetFiles[path] = new Uint8Array(
          a.data.buffer,
          a.data.byteOffset,
          a.data.byteLength,
        );

        return {
          createdAt: a.createdAt.toISOString(),
          fileName: a.fileName,
          fileSize: a.fileSize,
          height: a.height,
          id: a.id,
          mimeType: a.mimeType,
          path,
          width: a.width,
        };
      });

      assetCount += exportedAssets.length;

      exportedNotes.push({
        assets: exportedAssets,
        content: n.content,
        createdAt: n.createdAt.toISOString(),
        id: n.id,
        pinnedAt: n.pinnedAt?.toISOString() ?? null,
        updatedAt: n.updatedAt.toISOString(),
      });
    }

    const manifest: Manifest = {
      assetCount,
      exportedAt: new Date().toISOString(),
      noteCount: exportedNotes.length,
      version: 1,
    };

    const encoder = new TextEncoder();

    const zipData: Record<string, Uint8Array> = {
      "manifest.json": encoder.encode(JSON.stringify(manifest, null, 2)),
      "notes.json": encoder.encode(JSON.stringify(exportedNotes, null, 2)),
      ...assetFiles,
    };

    return zipSync(zipData);
  }
}

let _exportService: ExportService | undefined;

export function getExportService() {
  _exportService ??= new ExportService(
    new DBNoteRepository(db),
    new DBAssetRepository(db),
  );

  return _exportService;
}
