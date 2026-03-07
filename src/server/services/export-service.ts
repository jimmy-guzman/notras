import { TextEncoder } from "node:util";

import { Context, Effect, Layer } from "effect";
import { zipSync } from "fflate";

import type { NoteId } from "@/lib/id";
import type {
  ExportedAsset,
  ExportedFolder,
  ExportedNote,
  Manifest,
} from "@/server/schemas/export-schemas";

import {
  AssetRepository,
  AssetRepositoryLive,
} from "@/server/repositories/asset-repository";
import {
  FolderRepository,
  FolderRepositoryLive,
} from "@/server/repositories/folder-repository";
import {
  NoteRepository,
  NoteRepositoryLive,
} from "@/server/repositories/note-repository";
import {
  TagRepository,
  TagRepositoryLive,
} from "@/server/repositories/tag-repository";

function buildAssetPath(noteId: NoteId, assetId: string, fileName: string) {
  return `assets/${noteId}/${assetId}_${fileName}`;
}

interface IExportService {
  exportAll(userId: string): Effect.Effect<Uint8Array>;
}

export class ExportService extends Context.Tag("ExportService")<
  ExportService,
  IExportService
>() {}

const makeExportService = Effect.gen(function* () {
  const noteRepo = yield* NoteRepository;
  const assetRepo = yield* AssetRepository;
  const tagRepo = yield* TagRepository;
  const folderRepo = yield* FolderRepository;

  const exportAll = (userId: string): Effect.Effect<Uint8Array> => {
    return Effect.gen(function* () {
      const [notes, foldersWithCount] = yield* Effect.all([
        noteRepo.findMany(userId, {}).pipe(Effect.orDie),
        folderRepo.findByUserId(userId).pipe(Effect.orDie),
      ]);

      const noteIds = notes.map((n) => n.id as NoteId);
      const tagMap = yield* tagRepo
        .findByNoteIds(noteIds, userId)
        .pipe(Effect.orDie);

      const exportedNotes: ExportedNote[] = [];
      const assetFiles: Record<string, Uint8Array> = {};

      let assetCount = 0;

      for (const n of notes) {
        const noteId = n.id as NoteId;
        const assets = yield* assetRepo
          .findByNoteId(noteId, userId)
          .pipe(Effect.orDie);
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
        "folders.json": encoder.encode(
          JSON.stringify(exportedFolders, null, 2),
        ),
        "manifest.json": encoder.encode(JSON.stringify(manifest, null, 2)),
        "notes.json": encoder.encode(JSON.stringify(exportedNotes, null, 2)),
        ...assetFiles,
      };

      return zipSync(zipData);
    });
  };

  return { exportAll } satisfies IExportService;
});

export const ExportServiceLive = Layer.effect(
  ExportService,
  makeExportService,
).pipe(
  Layer.provide(
    Layer.mergeAll(
      NoteRepositoryLive,
      AssetRepositoryLive,
      TagRepositoryLive,
      FolderRepositoryLive,
    ),
  ),
);
