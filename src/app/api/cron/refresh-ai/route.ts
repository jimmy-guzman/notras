import { refreshUnprocessedNotes } from "@/lib/ai/refresh-unprocessed-notes";

export const runtime = "edge";

export async function GET() {
  const result = await refreshUnprocessedNotes();

  return Response.json({ ok: true, ...result });
}
