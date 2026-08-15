import { Effect } from "effect";

import type { NoteFilters } from "@/core";

import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export async function getNotes(filters?: NoteFilters) {
  return run(
    NoteService.pipe(
      Effect.flatMap((svc) => {
        return svc.list(filters);
      }),
    ),
  );
}
