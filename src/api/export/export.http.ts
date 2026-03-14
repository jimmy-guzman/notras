import { Effect } from "effect";

import { hono } from "@/api/lib/hono";
import { AppRuntime } from "@/server/layer";
import { ExportService } from "@/server/services/export-service";
import { UserService } from "@/server/services/user-service";

import { GetExportRoute } from "./export.api";

const app = hono();

app.openapi(GetExportRoute, async (c) => {
  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );

  const result = await AppRuntime.runPromise(
    ExportService.pipe(
      Effect.flatMap((svc) => svc.exportAll(userId)),
      Effect.either,
    ),
  );

  if (result._tag === "Left") {
    return c.json({ message: "export failed.", status: 500 }, 500);
  }

  const zipBuffer = result.right;
  const date = new Date().toISOString().slice(0, 10);

  return new Response(zipBuffer as BodyInit, {
    headers: {
      "Content-Disposition": `attachment; filename="notras-export-${date}.zip"`,
      "Content-Length": zipBuffer.byteLength.toString(),
      "Content-Type": "application/zip",
    },
  });
});

export default app;
