import { ManagedRuntime } from "effect";

import { makeTauriDatabase } from "@/server/adapters/tauri-database";
import { TauriFileStoreLive } from "@/server/adapters/tauri-file-store";
import { makeAppLayer } from "@/server/services/app-layer";

export const AppRuntime = ManagedRuntime.make(
  makeAppLayer({
    database: makeTauriDatabase(),
    fileStore: TauriFileStoreLive,
  })
);
