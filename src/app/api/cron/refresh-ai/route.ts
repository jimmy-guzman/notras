import { env } from "@/env";
import { refreshUnprocessedNotes } from "@/lib/ai/refresh-unprocessed-notes";

export const runtime = "edge";

export async function GET(request: Request) {
  if (request.headers.get("Authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await refreshUnprocessedNotes();

  return Response.json({ ok: true, ...result });
}
