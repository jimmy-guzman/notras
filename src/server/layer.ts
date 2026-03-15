import { Layer, Logger, ManagedRuntime } from "effect";

import { DatabaseLive } from "@/server/db";
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

const AppLayer = Layer.mergeAll(
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
).pipe(Layer.provide(DatabaseLive), Layer.provide(Logger.pretty));

export const AppRuntime = ManagedRuntime.make(AppLayer);
