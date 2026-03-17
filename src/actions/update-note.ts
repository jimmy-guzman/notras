"use server";

import { createFormAction } from "@orpc/react";
import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { toNoteId } from "@/lib/id";
import { authedProcedure } from "@/lib/orpc";
import { AppRuntime } from "@/server/layer";
import { updateNoteSchema } from "@/server/schemas/note-schemas";
import { tagsInputSchema } from "@/server/schemas/tag-schemas";
import { NoteService } from "@/server/services/note-service";

const updateNoteProcedure = authedProcedure
  .input(
    Schema.standardSchemaV1(
      Schema.Struct({
        content: updateNoteSchema.fields.content,
        noteId: updateNoteSchema.fields.noteId,
        tags: tagsInputSchema,
      }),
    ),
  )
  .handler(async ({ context, input }) => {
    const noteId = toNoteId(input.noteId);

    await AppRuntime.runPromise(
      NoteService.pipe(
        Effect.flatMap((svc) => {
          return svc.update(context.userId, noteId, input.content, [
            ...input.tags,
          ]);
        }),
      ),
    );

    updateTag("notes");
    updateTag("tags");
    redirect(`/notes/${noteId}`);
  });

export const updateNote = createFormAction(updateNoteProcedure);
