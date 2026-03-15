import { Effect } from "effect";

import { hono } from "@/api/lib/hono";
import { AppRuntime } from "@/server/layer";
import { ExportService } from "@/server/services/export-service";
import { UserService } from "@/server/services/user-service";

import { GetExportRoute } from "./export.api";

export const exportApp = hono();

exportApp.openapi(GetExportRoute, (c) => {
  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const userId = yield* UserService.pipe(
        Effect.flatMap((svc) => svc.getDeviceUserId()),
      );
      const zipBuffer = yield* ExportService.pipe(
        Effect.flatMap((svc) => svc.exportAll(userId)),
      );
      const date = new Date().toISOString().slice(0, 10);

      return new Response(zipBuffer as BodyInit, {
        headers: {
          "Content-Disposition": `attachment; filename="notras-export-${date}.zip"`,
          "Content-Length": zipBuffer.byteLength.toString(),
          "Content-Type": "application/zip",
        },
      });
    }).pipe(
      Effect.catchAllDefect((defect) => {
        return Effect.gen(function* () {
          yield* Effect.logError("GET /export failed", defect);

          return c.json({ message: "export failed.", status: 500 }, 500);
        });
      }),
    ),
  );
});
