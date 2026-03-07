import { Effect } from "effect";

import { serverAction } from "@/lib/authorized";
import { AppRuntime } from "@/server/layer";
import { ExportService } from "@/server/services/export-service";

export async function GET() {
  try {
    const zipBuffer = await serverAction(async (userId) => {
      return AppRuntime.runPromise(
        ExportService.pipe(Effect.flatMap((svc) => svc.exportAll(userId))),
      );
    });

    const date = new Date().toISOString().slice(0, 10);

    return new Response(zipBuffer as BodyInit, {
      headers: {
        "Content-Disposition": `attachment; filename="notras-export-${date}.zip"`,
        "Content-Length": zipBuffer.byteLength.toString(),
        "Content-Type": "application/zip",
      },
    });
  } catch {
    return new Response("export failed", { status: 500 });
  }
}
