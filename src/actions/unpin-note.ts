"use server";

import { updateTag } from "next/cache";

import type { NoteId } from "@/lib/id";

import { authorizedServerAction } from "@/lib/authorized";
import { getNoteService } from "@/server/services/note-service";

export async function unpinNote(noteId: NoteId) {
  await authorizedServerAction(async (userId) => {
    await getNoteService().unpin(userId, noteId);
  });

  updateTag("notes");
}
