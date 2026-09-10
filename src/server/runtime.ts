import { Layer, Logger, ManagedRuntime } from "effect";
import { TauriFileStoreLive } from "@/server/adapters/tauri-file-store";

export const AppRuntime = ManagedRuntime.make(
  Layer.merge(TauriFileStoreLive, Logger.layer([Logger.consolePretty()]))
);
