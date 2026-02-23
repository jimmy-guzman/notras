import { serverAction } from "@/lib/authorized";
import { getExportService } from "@/server/services/export-service";

export async function GET() {
  try {
    const zipBuffer = await serverAction(async (userId) => {
      return getExportService().exportAll(userId);
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
