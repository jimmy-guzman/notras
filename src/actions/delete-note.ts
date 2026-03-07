"use server";

import { Effect } from "effect";
import { updateTag } from "next/cache";

import type { NoteId } from "@/lib/id";

import { serverAction } from "@/lib/authorized";
import { AppRuntime } from "@/server/layer";
import { NoteService } from "@/server/services/note-service";

export async function deleteNote(noteId: NoteId) {
  await serverAction(async (userId) => {
    await AppRuntime.runPromise(
      NoteService.pipe(Effect.flatMap((svc) => svc.delete(userId, noteId))),
    );
  });

  updateTag("notes");
  updateTag("tags");
}
