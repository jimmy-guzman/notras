"use server";

import { createFormAction } from "@orpc/react";
import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { authedProcedure } from "@/lib/orpc";
import { AppRuntime } from "@/server/layer";
import { createNoteSchema } from "@/server/schemas/note-schemas";
import { tagsInputSchema } from "@/server/schemas/tag-schemas";
import { NoteService } from "@/server/services/note-service";

const createNoteProcedure = authedProcedure
  .input(
    Schema.standardSchemaV1(
      Schema.Struct({
        content: createNoteSchema.fields.content,
        tags: Schema.optionalWith(tagsInputSchema, { default: () => [] }),
      }),
    ),
  )
  .handler(async ({ context, input }) => {
    const id = await AppRuntime.runPromise(
      NoteService.pipe(
        Effect.flatMap((svc) => {
          return svc.create(context.userId, input.content, [...input.tags]);
        }),
      ),
    );

    updateTag("notes");
    updateTag("tags");
    redirect(`/notes/${id}`);
  });

export const createNote = createFormAction(createNoteProcedure);
