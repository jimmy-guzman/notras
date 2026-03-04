"use server";

import { updateTag } from "next/cache";

import type { NoteId } from "@/lib/id";

import { serverAction } from "@/lib/authorized";
import { getNoteService } from "@/server/services/note-service";

export async function deleteNote(noteId: NoteId) {
  await serverAction(async (userId) => {
    await getNoteService().delete(userId, noteId);
  });

  updateTag("notes");
  updateTag("tags");
}
