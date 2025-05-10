import { refreshUnlinkedNotes } from "@/lib/ai/refresh-unlinked-notes";

export const runtime = "edge";

export async function GET() {
  const result = await refreshUnlinkedNotes();

  return Response.json({ ok: true, ...result });
}
