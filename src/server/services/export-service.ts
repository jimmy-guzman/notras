import { TextEncoder } from "node:util";

import { zipSync } from "fflate";

import type { NoteId } from "@/lib/id";
import type { AssetRepository } from "@/server/repositories/asset-repository";
import type { FolderRepository } from "@/server/repositories/folder-repository";
import type { NoteRepository } from "@/server/repositories/note-repository";
import type { TagRepository } from "@/server/repositories/tag-repository";
import type {
  ExportedAsset,
  ExportedFolder,
  ExportedNote,
  Manifest,
} from "@/server/schemas/export-schemas";

import { getDb } from "@/server/db";
import { DBAssetRepository } from "@/server/repositories/asset-repository";
import { DBFolderRepository } from "@/server/repositories/folder-repository";
import { DBNoteRepository } from "@/server/repositories/note-repository";
import { DBTagRepository } from "@/server/repositories/tag-repository";

function buildAssetPath(noteId: NoteId, assetId: string, fileName: string) {
  return `assets/${noteId}/${assetId}_${fileName}`;
}

class ExportService {
  constructor(
    private noteRepo: NoteRepository,
    private assetRepo: AssetRepository,
    private tagRepo: TagRepository,
    private folderRepo: FolderRepository,
  ) {}

  async exportAll(userId: string): Promise<Uint8Array> {
    const [notes, foldersWithCount] = await Promise.all([
      this.noteRepo.findMany(userId, {}),
      this.folderRepo.findByUserId(userId),
    ]);

    const noteIds = notes.map((n) => n.id as NoteId);
    const tagMap = await this.tagRepo.findByNoteIds(noteIds, userId);

    const exportedNotes: ExportedNote[] = [];
    const assetFiles: Record<string, Uint8Array> = {};

    let assetCount = 0;

    for (const n of notes) {
      const noteId = n.id as NoteId;
      const assets = await this.assetRepo.findByNoteId(noteId, userId);
      const noteTags = tagMap[noteId] ?? [];

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
        folderId: n.folderId ?? null,
        id: n.id,
        pinnedAt: n.pinnedAt?.toISOString() ?? null,
        tags: noteTags.map((t) => t.name),
        updatedAt: n.updatedAt.toISOString(),
      });
    }

    const exportedFolders: ExportedFolder[] = foldersWithCount.map((f) => {
      return {
        createdAt: f.createdAt.toISOString(),
        id: f.id,
        name: f.name,
        updatedAt: f.updatedAt.toISOString(),
      };
    });

    const manifest: Manifest = {
      assetCount,
      exportedAt: new Date().toISOString(),
      folderCount: exportedFolders.length,
      noteCount: exportedNotes.length,
      version: 1,
    };

    const encoder = new TextEncoder();

    const zipData: Record<string, Uint8Array> = {
      "folders.json": encoder.encode(JSON.stringify(exportedFolders, null, 2)),
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
    new DBNoteRepository(getDb()),
    new DBAssetRepository(getDb()),
    new DBTagRepository(getDb()),
    new DBFolderRepository(getDb()),
  );

  return _exportService;
}
