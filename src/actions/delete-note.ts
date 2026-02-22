"use server";

import { updateTag } from "next/cache";

import type { NoteId } from "@/lib/id";

import { authorizedServerAction } from "@/lib/authorized";
import { getNoteService } from "@/server/services/note-service";

export async function deleteNote(noteId: NoteId) {
  await authorizedServerAction(async (userId) => {
    await getNoteService().delete(userId, noteId);
  });

  updateTag("notes");
}
