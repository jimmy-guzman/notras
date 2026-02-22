import { z } from "zod";

export const createNoteSchema = z.object({
  content: z.string().min(1, "Content is required"),
});

export const updateNoteSchema = z.object({
  content: z.string().min(1, "Content is required"),
  noteId: z.string().min(1, "Note ID is required"),
});
