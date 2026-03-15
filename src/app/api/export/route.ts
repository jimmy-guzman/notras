import { Effect } from "effect";

import { AppRuntime } from "@/server/layer";
import { ExportService } from "@/server/services/export-service";
import { UserService } from "@/server/services/user-service";

export async function GET() {
  try {
    const zipBuffer = await AppRuntime.runPromise(
      Effect.gen(function* () {
        const userId = yield* UserService.pipe(
          Effect.flatMap((svc) => svc.getDeviceUserId()),
        );

        return yield* ExportService.pipe(
          Effect.flatMap((svc) => svc.exportAll(userId)),
        );
      }),
    );

    const date = new Date().toISOString().slice(0, 10);

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Disposition": `attachment; filename="notras-export-${date}.zip"`,
        "Content-Length": zipBuffer.byteLength.toString(),
        "Content-Type": "application/zip",
      },
    });
  } catch (error) {
    await AppRuntime.runPromise(
      Effect.logError("GET /api/export failed", error),
    );

    return Response.json(
      { message: "export failed.", status: 500 },
      { status: 500 },
    );
  }
}
