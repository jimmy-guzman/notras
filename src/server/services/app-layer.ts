import { Layer, Logger } from "effect";

import type { FileStore } from "@/core";
import type { DrizzleDb } from "@/server/db";

import { Database } from "@/server/db";

import { NoteService } from "./note-service";

export interface AppLayerConfig {
  /** Read-only handle on the derived search index. */
  database: DrizzleDb;
  /** Runtime-specific note file access, e.g. Tauri commands in the app. */
  fileStore: Layer.Layer<FileStore>;
}

/**
 * Wire every service over the injected platform pieces. This module stays
 * framework-free; adapters and `runtime.ts` supply the platform.
 */
export function makeAppLayer(config: AppLayerConfig) {
  // The logger is merged, not provided: `Layer.provide` would scope it to
  // layer construction, where nothing logs.
  return Layer.mergeAll(
    NoteService.layer,
    config.fileStore,
    Logger.layer([Logger.consolePretty()])
  ).pipe(
    Layer.provide(
      Layer.merge(Layer.succeed(Database, config.database), config.fileStore)
    )
  );
}
