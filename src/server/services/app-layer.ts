import { Layer, Logger } from "effect";

import type { CacheInvalidator } from "@/core";
import type { DatabaseConfig } from "@/server/db";

import { makeDatabaseLayer } from "@/server/db";
import { AssetServiceLive } from "@/server/services/asset-service";
import { ExportServiceLive } from "@/server/services/export-service";
import { FolderServiceLive } from "@/server/services/folder-service";
import { FormatServiceLive } from "@/server/services/format-service";
import { ImportServiceLive } from "@/server/services/import-service";
import { LinkServiceLive } from "@/server/services/link-service";
import { NoteServiceLive } from "@/server/services/note-service";
import { OgServiceLive } from "@/server/services/og-service";
import { TagServiceLive } from "@/server/services/tag-service";
import { UserServiceLive } from "@/server/services/user-service";

export interface AppLayerConfig {
  /** Runtime-specific cache invalidation, e.g. `next/cache` on the web. */
  cacheInvalidator: Layer.Layer<CacheInvalidator>;
  database: DatabaseConfig;
}

/**
 * Wire every service over a database connection and a cache invalidator. Each
 * app builds its own `ManagedRuntime` from this so no service has to reach back
 * into a runtime it does not own.
 */
export function makeAppLayer(config: AppLayerConfig) {
  return Layer.mergeAll(
    AssetServiceLive,
    ExportServiceLive,
    FolderServiceLive,
    FormatServiceLive,
    ImportServiceLive,
    LinkServiceLive,
    NoteServiceLive,
    OgServiceLive,
    TagServiceLive,
    UserServiceLive,
  ).pipe(
    Layer.provide(
      Layer.merge(makeDatabaseLayer(config.database), config.cacheInvalidator),
    ),
    Layer.provide(Logger.pretty),
  );
}
