import { TextEncoder } from "node:util";

import { serverAction } from "@/lib/authorized";
import { toNoteId } from "@/lib/id";
import { getNoteService } from "@/server/services/note-service";

const POLL_INTERVAL_MS = 30_000;

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await serverAction((id) => Promise.resolve(id));
  const noteService = getNoteService();

  let interval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    cancel() {
      clearInterval(interval);
    },

    start(controller) {
      const encoder = new TextEncoder();
      const notified = new Set<string>();

      function send(data: string) {
        controller.enqueue(encoder.encode(data));
      }

      async function check() {
        try {
          const dueNotes = await noteService.getDueReminders(userId);

          for (const dueNote of dueNotes) {
            if (notified.has(dueNote.id)) continue;

            notified.add(dueNote.id);

            const noteId = toNoteId(dueNote.id);

            send(
              `data: ${JSON.stringify({ content: dueNote.content, noteId })}\n\n`,
            );
          }
        } catch {
          // silently ignore -- stream should stay open
        }
      }

      void check();

      interval = setInterval(() => {
        void check();
      }, POLL_INTERVAL_MS);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}
